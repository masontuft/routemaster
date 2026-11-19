import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as AccessLink from "./models/accessLink.js";
import * as Staff from "./models/staff.js";
import * as Admin from "./models/admin.js";
import * as ServiceRequest from "./models/serviceRequest.js";
import * as ServiceType from "./models/serviceType.js";
import * as Lead from "./models/lead.js";
import * as Review from "./models/review.js";
import * as DayBoard from "./models/dayBoard.js";
import { hashPassword } from "./utils/password.js";

// Two companies in one database (ADR 0018). Company 1 is Ann Lee's, company 2 is Bo Kim's. Each test checks that one
// company's staff cannot find, change or delete the other's customers and properties, by id, by search and in bulk.
// Customers, properties, the users page (pass 2a) and requests, leads, reviews and the service catalog (pass 2b) are
// scoped so far, and these tests cover exactly those.

const db = testDb("isolation");
const pool = db.pool;
let app;
let server;
let ann;
let annProperty;
let bo;
let boProperty;
let type2;

function listen(application) {
    return new Promise((resolve) => {
        const started = application.listen(0, () => {
            resolve(started);
        });
    });
}

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    server?.close();
    app?.locals.sessionStore.close();
    app = createApp({ pool, sessionSecret: "test-secret" });
    server = await listen(app);

    await pool.query("INSERT INTO companies (name, slug) VALUES ('Second Co', 'second-co')");
    ann = await Customer.create(pool, 1, { name: "Ann Lee", phone: "(208) 555-0101" });
    annProperty = await Property.create(pool, ann, { street: "12 Oak Street", city: "Rexburg", zip: "83440" });
    bo = await Customer.create(pool, 2, { name: "Bo Kim", phone: "(208) 555-0202" });
    boProperty = await Property.create(pool, bo, { street: "9 Elm Street", city: "Rigby", zip: "83442" });
    // Company 1 keeps the two services migration 006 made (ids 1 and 2). Company 2 has one of its own.
    type2 = (await pool.query(
        "INSERT INTO service_types (name, price_cents, company_id) VALUES ('Lawn Aeration', 5000, 2) RETURNING id",
    )).rows[0].id;
});
after(async () => {
    server?.close();
    app?.locals.sessionStore.close();
    await db.close();
});

async function tokenFrom(agent, pagePath) {
    const res = await agent.get(pagePath);
    const found = res.text.match(/name="_csrf" value="([^"]+)"/);

    if (!found) {
        throw new Error(`No CSRF token on GET ${pagePath}: status ${res.status}, location ${res.headers.location}, body ${res.text.slice(0, 200)}`);
    }

    return found[1];
}

async function send(agent, pagePath, action, fields) {
    const _csrf = await tokenFrom(agent, pagePath);
    return agent.post(action).type("form").send({ _csrf, ...fields });
}

async function agentFor(companyId, roleName) {
    const agent = request.agent(server);
    const email = `${roleName}${companyId}@example.com`;
    await User.create(pool, { companyId, email, passwordHash: await hashPassword("longenough"), roleName });
    await send(agent, "/login", "/login", { email, password: "longenough" });
    return agent;
}

async function nameOf(id) {
    const { rows } = await pool.query("SELECT name FROM customers WHERE id = $1", [id]);
    return rows[0]?.name;
}

test("the customer list and the search show only the logged-in company's customers", async () => {
    const owner1 = await agentFor(1, "owner");
    const owner2 = await agentFor(2, "owner");

    const first = await owner1.get("/staff/customers");
    const second = await owner2.get("/staff/customers");
    const searched = await owner2.get("/staff/customers?q=ann");

    assert.match(first.text, /Ann Lee/);
    assert.doesNotMatch(first.text, /Bo Kim/);
    assert.match(second.text, /Bo Kim/);
    assert.doesNotMatch(second.text, /Ann Lee/);
    assert.doesNotMatch(searched.text, /Ann Lee/);
});

test("another company's customer is not found by id: view, edit, link and delete all give 404 and change nothing", async () => {
    const owner2 = await agentFor(2, "owner");
    const page = `/staff/customers/${ann}`;

    assert.strictEqual((await owner2.get(page)).status, 404);
    assert.strictEqual((await owner2.get(`${page}/edit`)).status, 404);
    assert.strictEqual((await owner2.get(`${page}/delete`)).status, 404);

    const edited = await send(owner2, "/staff/customers", `${page}/edit`, { name: "Hacked", phone: "", email: "" });
    const linked = await send(owner2, "/staff/customers", `${page}/links`, {});
    const added = await send(owner2, "/staff/customers", `${page}/properties`, { street: "1 Evil Way", city: "Rexburg" });
    const deleted = await send(owner2, "/staff/customers", `${page}/delete`, {});

    assert.deepStrictEqual([edited.status, linked.status, added.status, deleted.status], [404, 404, 404, 404]);
    assert.strictEqual(await nameOf(ann), "Ann Lee");
    assert.strictEqual((await pool.query("SELECT count(*)::int AS n FROM access_links")).rows[0].n, 0);
    assert.strictEqual((await Property.listForCustomer(pool, ann)).length, 1);
});

test("revoking a link of another company's customer gives 404 and leaves the link live", async () => {
    const owner2 = await agentFor(2, "owner");
    await AccessLink.create(pool, { customerId: ann });
    const linkId = (await pool.query("SELECT id FROM access_links")).rows[0].id;

    const res = await send(owner2, "/staff/customers", `/staff/customers/${ann}/links/${linkId}/revoke`, {});

    assert.strictEqual(res.status, 404);
    assert.strictEqual((await pool.query("SELECT revoked_at FROM access_links")).rows[0].revoked_at, null);
});

test("another company's property cannot be opened or edited", async () => {
    const owner2 = await agentFor(2, "owner");
    const page = `/staff/properties/${annProperty}/edit`;

    const shown = await owner2.get(page);
    const saved = await send(owner2, "/staff/customers", page, { street: "1 Evil Way", city: "Nowhere", zip: "", notes: "", subdivisionId: "" });

    assert.strictEqual(shown.status, 404);
    assert.strictEqual(saved.status, 404);
    assert.strictEqual((await pool.query("SELECT street FROM properties WHERE id = $1", [annProperty])).rows[0].street, "12 Oak Street");
});

test("a company can open and edit its own customer and property", async () => {
    const owner2 = await agentFor(2, "owner");

    assert.strictEqual((await owner2.get(`/staff/customers/${bo}`)).status, 200);
    const renamed = await send(owner2, "/staff/customers", `/staff/customers/${bo}/edit`, { name: "Bo Kimball", phone: "", email: "" });
    const moved = await send(owner2, "/staff/customers", `/staff/properties/${boProperty}/edit`, {
        street: "10 Elm Street", city: "Rigby", zip: "83442", notes: "", subdivisionId: "",
    });

    assert.strictEqual(renamed.status, 303);
    assert.strictEqual(moved.status, 303);
    assert.strictEqual(await nameOf(bo), "Bo Kimball");
});

test("delete-all by one company's owner removes only that company's customers", async () => {
    const owner2 = await agentFor(2, "owner");

    const confirm = await owner2.get("/admin/clear/all");
    assert.match(confirm.text, /1 customer\b/);

    const res = await send(owner2, "/admin/clear/all", "/admin/clear/all", {
        phrase: "delete all customers", customers: 1, properties: 1, requests: 0, leads: 0, reviews: 0, links: 0,
    });

    assert.strictEqual(res.status, 303);
    assert.strictEqual(await nameOf(bo), undefined);
    assert.strictEqual(await nameOf(ann), "Ann Lee");
    assert.strictEqual((await Property.listForCustomer(pool, ann)).length, 1);
});

test("the bulk counts and the bulk delete are limited to the company they are given", async () => {
    const seenBy1 = await Customer.countClear(pool, 1, null);
    const seenBy2 = await Customer.countClear(pool, 2, null);

    assert.deepStrictEqual([seenBy1.customers, seenBy1.properties], [1, 1]);
    assert.deepStrictEqual([seenBy2.customers, seenBy2.properties], [1, 1]);

    const bothCompanies = { customers: 2, properties: 2, requests: 0, leads: 0, reviews: 0, links: 0 };
    const wrong = await Customer.clear(pool, 2, null, bothCompanies);
    assert.strictEqual(wrong.deleted, false, "a count that includes the other company's rows must not match");
    assert.strictEqual(await nameOf(ann), "Ann Lee");
    assert.strictEqual(await nameOf(bo), "Bo Kim");

    const right = await Customer.clear(pool, 2, null, seenBy2);
    assert.strictEqual(right.deleted, true);
    assert.strictEqual(await nameOf(bo), undefined);
    assert.strictEqual(await nameOf(ann), "Ann Lee");
});

test("clearing one import batch also stays inside its company", async () => {
    await pool.query("INSERT INTO import_batches (sheet_id, sheet_name, season_year, plan_hash) VALUES ('s', 'Jobs', 2026, $1)", ["a".repeat(64)]);
    const batchId = (await pool.query("SELECT id FROM import_batches")).rows[0].id;
    await pool.query("UPDATE customers SET import_batch_id = $1", [batchId]);

    const seen = await Customer.countClear(pool, 2, batchId);
    const result = await Customer.clear(pool, 2, batchId, seen);

    assert.deepStrictEqual([seen.customers, result.deleted], [1, true]);
    assert.strictEqual(await nameOf(ann), "Ann Lee");
});

test("the customer model finds, updates, counts and removes only inside the company it is given", async () => {
    assert.strictEqual(await Customer.findById(pool, 2, ann), null);
    assert.strictEqual((await Customer.findById(pool, 1, ann)).name, "Ann Lee");
    assert.strictEqual(await Customer.update(pool, 2, ann, { name: "Hacked" }), false);
    assert.strictEqual(await Customer.countRelated(pool, 2, ann), null);
    assert.strictEqual(await Customer.remove(pool, 2, ann), false);
    assert.strictEqual(await nameOf(ann), "Ann Lee");
    assert.deepStrictEqual(await Customer.search(pool, 2, "ann"), []);
});

test("a company that is left out finds nothing and cannot write", async () => {
    assert.strictEqual(await Customer.findById(pool, undefined, ann), null);
    assert.strictEqual(await Customer.findById(pool, undefined, bo), null);
    await assert.rejects(Customer.create(pool, undefined, { name: "Nobody" }), /not-null/);
});

test("matching a visitor by name, phone and street only looks inside one company", async () => {
    const annsDetails = { name: "Ann Lee", phone: "208-555-0101", address: "12 Oak Street" };
    const bosDetails = { name: "Bo Kim", phone: "208-555-0202", address: "9 Elm Street" };

    assert.strictEqual((await Customer.findByContact(pool, 1, annsDetails)).customer_id, ann);
    assert.strictEqual(await Customer.findByContact(pool, 2, annsDetails), null);
    assert.strictEqual((await Customer.findByContact(pool, 2, bosDetails)).customer_id, bo);
    assert.strictEqual(await Customer.findByContact(pool, 1, bosDetails), null);
});

test("the import lookups only see the company they are given", async () => {
    assert.deepStrictEqual(await Customer.listNormalizedByIds(pool, 2, [ann, bo]).then((rows) => {
        return rows.map((row) => {
            return row.id;
        });
    }), [bo]);
    assert.deepStrictEqual(await Customer.listByNamePhonePairs(pool, 2, [{ name: "ann lee", phone: "2085550101" }]), []);
    assert.deepStrictEqual(await Property.listByNormalizedAddresses(pool, 2, ["12 oak st"]), []);
    assert.strictEqual((await Property.listByNormalizedAddresses(pool, 1, ["12 oak st"])).length, 1);
    assert.strictEqual(await Property.findById(pool, 2, annProperty), null);
    assert.strictEqual(await Property.update(pool, 2, annProperty, { street: "1 Evil Way" }), false);
});

test("a customer who arrives by link gets a login and a session in their own company", async () => {
    const token = await AccessLink.create(pool, { customerId: bo });
    const visitor = request.agent(server);

    const res = await send(visitor, `/l/${token}`, `/l/${token}`, {});
    const { rows } = await pool.query("SELECT company_id FROM users WHERE id = (SELECT user_id FROM customers WHERE id = $1)", [bo]);

    assert.strictEqual(res.status, 302);
    assert.strictEqual(rows[0].company_id, 2);
});

test("a staff user created by an owner belongs to that owner's company", async () => {
    const owner2 = await agentFor(2, "owner");

    const res = await send(owner2, "/admin/users/new", "/admin/users", {
        email: "new.dispatcher@example.com", password: "longenough", confirm: "longenough", role: "dispatcher",
    });
    const { rows } = await pool.query("SELECT company_id FROM users WHERE email = 'new.dispatcher@example.com'");

    assert.strictEqual(res.status, 302);
    assert.strictEqual(rows[0].company_id, 2);
});

test("matching a request as a new customer puts the customer in the request's company", async () => {
    const lead = await pool.query(
        `INSERT INTO leads (name, name_normalized, phone, phone_normalized, address, address_normalized, company_id)
         VALUES ('Cy Roe', 'cy roe', '208-555-0303', '2085550303', '3 Pine Street', '3 pine st', 2) RETURNING id`,
    );
    const requestRow = await pool.query(
        `INSERT INTO service_requests (lead_id, service_type_id, status_id, preferred_date, company_id)
         SELECT $1, 1, id, '2030-01-01', 2 FROM request_statuses WHERE name = 'Needs Review' RETURNING id`,
        [lead.rows[0].id],
    );

    const result = await Staff.matchAsNew(pool, 2, requestRow.rows[0].id, { city: "Rigby", zip: "83442" }, null);
    const made = await pool.query("SELECT company_id FROM customers WHERE name = 'Cy Roe'");

    assert.strictEqual(result.ok, true);
    assert.strictEqual(made.rows[0].company_id, 2);
});

test("a registered customer joins the first company, because /register has no company in its address yet", async () => {
    const visitor = request.agent(server);

    await send(visitor, "/register", "/register", { email: "new.person@example.com", password: "longenough", confirm: "longenough" });
    const { rows } = await pool.query("SELECT company_id FROM users WHERE email = 'new.person@example.com'");

    assert.strictEqual(rows[0]?.company_id, 1);
});

async function roleOf(userId) {
    const { rows } = await pool.query(
        "SELECT roles.name FROM users JOIN roles ON roles.id = users.role_id WHERE users.id = $1",
        [userId],
    );
    return rows[0]?.name;
}

test("the users page lists only the logged-in company's users, including its link-only customers", async () => {
    const owner1 = await agentFor(1, "owner");
    const owner2 = await agentFor(2, "owner");
    const linkUser = await Customer.ensureUser(pool, ann);

    const first = await owner1.get("/admin/users");
    const second = await owner2.get("/admin/users");

    assert.match(first.text, /owner1@example\.com/);
    assert.doesNotMatch(first.text, /owner2@example\.com/);
    assert.match(second.text, /owner2@example\.com/);
    assert.doesNotMatch(second.text, /owner1@example\.com/);
    assert.strictEqual((await Admin.listUsers(pool, 2)).some((user) => {
        return user.id === linkUser.id;
    }), false);
    assert.strictEqual((await Admin.listUsers(pool, 1)).some((user) => {
        return user.id === linkUser.id;
    }), true);
});

test("an owner cannot change the role of another company's user: 404, and nothing changes", async () => {
    const owner2 = await agentFor(2, "owner");
    const dispatcher1 = await User.create(pool, {
        companyId: 1, email: "disp1@example.com", passwordHash: "x", roleName: "dispatcher",
    });

    const res = await send(owner2, "/admin/users", `/admin/users/${dispatcher1.id}/role`, { role: "owner" });

    assert.strictEqual(res.status, 404);
    assert.strictEqual(await roleOf(dispatcher1.id), "dispatcher");
    assert.deepStrictEqual(await Admin.changeRole(pool, 2, dispatcher1.id, "owner", 0), { error: "not_found" });
});

test("an owner can still change the role of a user in their own company", async () => {
    const owner2 = await agentFor(2, "owner");
    const dispatcher2 = await User.create(pool, {
        companyId: 2, email: "disp2@example.com", passwordHash: "x", roleName: "dispatcher",
    });

    const res = await send(owner2, "/admin/users", `/admin/users/${dispatcher2.id}/role`, { role: "owner" });

    assert.strictEqual(res.status, 302);
    assert.strictEqual(await roleOf(dispatcher2.id), "owner");
});

test("the last owner rule counts one company's owners, not everyone's", async () => {
    // Company 1 has two owners. Company 2 has one. The one in company 2 is still the last owner of company 2.
    await User.create(pool, { companyId: 1, email: "a1@example.com", passwordHash: "x", roleName: "owner" });
    await User.create(pool, { companyId: 1, email: "a2@example.com", passwordHash: "x", roleName: "owner" });
    const only2 = await User.create(pool, { companyId: 2, email: "b1@example.com", passwordHash: "x", roleName: "owner" });

    assert.deepStrictEqual(await Admin.changeRole(pool, 2, only2.id, "dispatcher", 0), { error: "last_owner" });
    assert.strictEqual(await roleOf(only2.id), "owner");

    await User.create(pool, { companyId: 2, email: "b2@example.com", passwordHash: "x", roleName: "owner" });
    assert.deepStrictEqual(await Admin.changeRole(pool, 2, only2.id, "dispatcher", 0), { ok: true });
});

function futureDay(days = 20) {
    return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function annRequest() {
    return ServiceRequest.create(pool, 1, {
        customerId: ann, propertyId: annProperty, serviceTypeId: 1, preferredDate: futureDay(),
    });
}

async function setStatus(requestId, name) {
    await pool.query(
        "UPDATE service_requests SET status_id = (SELECT id FROM request_statuses WHERE name = $2) WHERE id = $1",
        [requestId, name],
    );
}

test("the request queue, the dashboard counts and a request page show only the logged-in company's requests", async () => {
    const requestId = await annRequest();
    const owner1 = await agentFor(1, "owner");
    const owner2 = await agentFor(2, "owner");

    const mine = await owner1.get("/staff/requests");
    const theirs = await owner2.get("/staff/requests");

    assert.match(mine.text, /Ann Lee/);
    assert.doesNotMatch(theirs.text, /Ann Lee/);
    assert.strictEqual((await owner1.get(`/staff/requests/${requestId}`)).status, 200);
    assert.strictEqual((await owner2.get(`/staff/requests/${requestId}`)).status, 404);
    assert.deepStrictEqual(
        (await Staff.countsByStatus(pool, 2)).map((row) => {
            return row.total;
        }).filter(Boolean),
        [],
    );
    assert.strictEqual((await Staff.countsByStatus(pool, 1)).find((row) => {
        return row.status === "Requested";
    }).total, 1);
});

test("another company's request cannot be moved, confirmed, given a referrer or matched: 404 and nothing changes", async () => {
    const requestId = await annRequest();
    const owner2 = await agentFor(2, "owner");
    const page = `/staff/requests/${requestId}`;

    const status = await send(owner2, "/staff", `${page}/status`, { status: "Cancelled", note: "" });
    const confirm = await send(owner2, "/staff", `${page}/confirm`, {});
    const referrer = await send(owner2, "/staff", `${page}/referrer`, { referredBy: "Hacker" });
    const match = await send(owner2, "/staff", `${page}/match`, { propertyId: boProperty });

    assert.deepStrictEqual([status.status, confirm.status, referrer.status, match.status], [404, 404, 404, 404]);
    const { rows } = await pool.query(
        `SELECT request_statuses.name AS status, referred_by FROM service_requests
         JOIN request_statuses ON request_statuses.id = service_requests.status_id WHERE service_requests.id = $1`,
        [requestId],
    );
    assert.deepStrictEqual(rows[0], { status: "Requested", referred_by: null });
});

test("the request model answers 'not found' for another company's request, and the owner numbers count one company", async () => {
    const requestId = await annRequest();

    assert.strictEqual(await Staff.findRequest(pool, 2, requestId), null);
    assert.strictEqual((await Staff.findRequest(pool, 1, requestId)).id, requestId);
    assert.deepStrictEqual(await Staff.changeStatus(pool, 2, requestId, { to: "Cancelled", changedBy: null }), { error: "not_found" });
    assert.strictEqual(await Staff.setReferrer(pool, 2, requestId, "x"), false);
    assert.strictEqual(await Staff.confirmTentative(pool, 2, requestId, null), false);
    assert.deepStrictEqual(await Staff.historyFor(pool, 2, requestId), []);
    assert.ok((await Staff.historyFor(pool, 1, requestId)).length > 0);
    assert.strictEqual((await Staff.stats(pool, 1)).requested_this_month, 1);
    assert.strictEqual((await Staff.stats(pool, 2)).requested_this_month, 0);
    assert.strictEqual((await Staff.listRequests(pool, 2)).length, 0);
});

test("matching to a property takes only a property of the same company", async () => {
    const lead = await Lead.findOrCreate(pool, 2, { name: "Cy Roe", phone: "208-555-0303", address: "3 Pine Street" });
    const requestId = await ServiceRequest.create(pool, 2, {
        leadId: lead, serviceTypeId: type2, preferredDate: futureDay(),
    });

    const wrong = await Staff.matchToProperty(pool, 2, requestId, annProperty, null);
    const right = await Staff.matchToProperty(pool, 2, requestId, boProperty, null);
    const elsewhere = await Staff.matchToProperty(pool, 1, requestId, annProperty, null);

    assert.deepStrictEqual(wrong, { error: "property" });
    assert.strictEqual(right.ok, true);
    assert.deepStrictEqual(elsewhere, { error: "not_found" });
});

test("a request is made only with a customer and a service type of its own company", async () => {
    await assert.rejects(
        ServiceRequest.create(pool, 2, {
            customerId: ann, propertyId: annProperty, serviceTypeId: type2, preferredDate: futureDay(),
        }),
        /customer is not in this company/,
    );
    await assert.rejects(
        ServiceRequest.create(pool, 2, {
            customerId: bo, propertyId: boProperty, serviceTypeId: 1, preferredDate: futureDay(),
        }),
        /service type is not in this company/,
    );
    assert.strictEqual((await pool.query("SELECT count(*)::int AS n FROM service_requests")).rows[0].n, 0);

    const id = await ServiceRequest.create(pool, 2, {
        customerId: bo, propertyId: boProperty, serviceTypeId: type2, preferredDate: futureDay(),
    });
    assert.strictEqual((await pool.query("SELECT company_id FROM service_requests WHERE id = $1", [id])).rows[0].company_id, 2);
});

test("a lead belongs to one company: another company cannot read or convert it, and is never handed it", async () => {
    const lead = await Lead.findOrCreate(pool, 1, { name: "Sam Poe", phone: "208-555-0404", address: "2 Oak Street" });

    assert.strictEqual(await Lead.findOrCreate(pool, 1, { name: "Sam Poe", phone: "208-555-0404", address: "2 Oak Street" }), lead);
    assert.strictEqual(await Lead.findById(pool, 2, lead), null);
    assert.strictEqual(await Lead.markConverted(pool, 2, lead, bo), false);
    // The old three-column lead key is still in the database until the contract migration (issue 75), so company 2
    // cannot hold the same person and street yet. It is refused. It is never answered with company 1's lead.
    await assert.rejects(Lead.findOrCreate(pool, 2, { name: "Sam Poe", phone: "208-555-0404", address: "2 Oak Street" }), /unique/);
});

test("review moderation, the public list and the average are limited to one company", async () => {
    const requestId = await annRequest();
    await setStatus(requestId, "Completed");
    const reviewId = await Review.save(pool, { requestId, customerId: ann, rating: 5, body: "Great work" });
    const owner2 = await agentFor(2, "owner");

    const staffList = await owner2.get("/staff/reviews");
    const hide = await send(owner2, "/staff/reviews", `/staff/reviews/${reviewId}/hide`, {});
    const remove = await send(owner2, "/staff/reviews", `/staff/reviews/${reviewId}/delete`, {});

    assert.doesNotMatch(staffList.text, /Great work/);
    assert.deepStrictEqual([hide.status, remove.status], [404, 404]);
    assert.strictEqual((await pool.query("SELECT hidden FROM reviews WHERE id = $1", [reviewId])).rows[0].hidden, false);
    assert.strictEqual((await Review.listPublic(pool, 2)).length, 0);
    assert.strictEqual((await Review.listPublic(pool, 1)).length, 1);
    assert.strictEqual((await Review.averageRating(pool, 2)).total, 0);
    assert.strictEqual((await Review.averageRating(pool, 1)).total, 1);
    assert.strictEqual(await Review.setHidden(pool, 2, reviewId, true), false);
    assert.strictEqual(await Review.remove(pool, 2, reviewId), false);
});

test("each company has its own service catalog: an owner sees and edits only their own", async () => {
    const owner2 = await agentFor(2, "owner");

    const list = await owner2.get("/admin/service-types");
    const edit = await owner2.get("/admin/service-types/1/edit");
    const save = await send(owner2, "/admin/service-types", "/admin/service-types/1", { name: "Hacked", price: "0.01", active: "on" });

    assert.match(list.text, /Lawn Aeration/);
    assert.doesNotMatch(list.text, /Sprinkler Blowout/);
    assert.strictEqual(edit.status, 404);
    assert.strictEqual(save.status, 404);
    assert.strictEqual((await ServiceType.findById(pool, 1, 1)).name, "Sprinkler Blowout");
    assert.strictEqual(await ServiceType.findById(pool, 2, 1), null);
    assert.deepStrictEqual((await ServiceType.listActive(pool, 2)).map((row) => {
        return row.name;
    }), ["Lawn Aeration"]);
    assert.strictEqual(await ServiceType.findActive(pool, 2, 1), null);
});

test("a service name can repeat across companies, but not within one", async () => {
    assert.deepStrictEqual(await ServiceType.create(pool, 2, { name: "Sprinkler Blowout", priceCents: 9000, active: true }), { ok: true });
    assert.deepStrictEqual(await ServiceType.create(pool, 2, { name: "Sprinkler Blowout", priceCents: 9000, active: true }), { error: "name_taken" });
    assert.deepStrictEqual(await ServiceType.update(pool, 2, 1, { name: "Hacked", priceCents: 1, active: true }), { ok: true });
    assert.strictEqual((await ServiceType.findById(pool, 1, 1)).name, "Sprinkler Blowout", "updating through company 2 changed nothing");
});

test("a customer arriving by link sees only their company's services, and cannot request another company's", async () => {
    const token = await AccessLink.create(pool, { customerId: bo });
    const visitor = request.agent(server);
    await send(visitor, `/l/${token}`, `/l/${token}`, {});

    const form = await visitor.get("/requests/new");
    const wrong = await send(visitor, "/requests/new", "/requests", {
        serviceTypeId: 1, propertyId: boProperty, preferredDate: futureDay(), notes: "",
    });
    const right = await send(visitor, "/requests/new", "/requests", {
        serviceTypeId: type2, propertyId: boProperty, preferredDate: futureDay(), notes: "",
    });

    assert.match(form.text, /Lawn Aeration/);
    assert.doesNotMatch(form.text, /Sprinkler Blowout/);
    assert.strictEqual(wrong.status, 400);
    assert.strictEqual(right.status, 302);
    assert.strictEqual((await pool.query("SELECT count(*)::int AS n FROM service_requests")).rows[0].n, 1);
    assert.strictEqual((await pool.query("SELECT company_id FROM service_requests")).rows[0].company_id, 2);
});

test("the day board books only requests of the company it is given", async () => {
    const requestId = await annRequest();

    const result = await DayBoard.scheduleMany(pool, 2, [requestId], { day: futureDay(5), changedBy: null });

    assert.deepStrictEqual(result, { scheduled: 0, skipped: 1 });
    assert.strictEqual(
        (await pool.query(
            "SELECT request_statuses.name FROM service_requests JOIN request_statuses ON request_statuses.id = status_id",
        )).rows[0].name,
        "Requested",
    );
    assert.deepStrictEqual(await DayBoard.scheduleMany(pool, 1, [requestId], { day: futureDay(5), changedBy: null }), {
        scheduled: 1, skipped: 0,
    });
});
