import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as ServiceRequest from "./models/serviceRequest.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("staff");
const pool = db.pool;
let app;
let server;

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
});
after(async () => {
    server?.close();
    app?.locals.sessionStore.close();
    await db.close();
});

async function tokenFrom(agent, pagePath) {
    const res = await agent.get(pagePath);
    return res.text.match(/name="_csrf" value="([^"]+)"/)[1];
}

async function post(agent, pagePath, action, fields) {
    const _csrf = await tokenFrom(agent, pagePath);
    return agent.post(action).type("form").send({ _csrf, ...fields });
}

async function loginAs(agent, email, roleName) {
    await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName });
    return post(agent, "/login", "/login", { email, password: "longenough" });
}

async function staffAgent(roleName = "dispatcher") {
    const agent = request.agent(server);
    await loginAs(agent, `${roleName}@example.com`, roleName);
    return agent;
}

function daysAhead(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function matchedRequest(name = "Ann Lee", street = "12 Oak Street", phone = "208-555-0101") {
    const customerId = await Customer.create(pool, { name, phone });
    const propertyId = await Property.create(pool, customerId, { street, city: "Rexburg" });
    const id = await ServiceRequest.create(pool, {
        customerId, propertyId, serviceTypeId: 1, preferredDate: daysAhead(10),
    });
    return { id, customerId, propertyId };
}

async function unmatchedRequest(contact = { name: "Cy Doe", phone: "208-555-0303", address: "7 Birch Lane" }) {
    return ServiceRequest.create(pool, { serviceTypeId: 1, preferredDate: daysAhead(10), contact });
}

async function statusOf(id) {
    const { rows } = await pool.query(
        `SELECT request_statuses.name FROM service_requests
         JOIN request_statuses ON request_statuses.id = service_requests.status_id
         WHERE service_requests.id = $1`, [id]);
    return rows[0].name;
}

test("staff pages send a visitor to log in and refuse a customer", async () => {
    const paths = ["/staff", "/staff/requests", "/staff/requests/1", "/staff/customers", "/staff/customers/1"];

    for (const path of paths) {
        const visitor = await request(server).get(path);
        assert.strictEqual(visitor.status, 302, path);
        assert.strictEqual(visitor.headers.location, "/login");
    }

    const customer = request.agent(server);
    await loginAs(customer, "ann@example.com", "customer");

    for (const path of paths) {
        assert.strictEqual((await customer.get(path)).status, 403, path);
    }

    const token = await tokenFrom(customer, "/requests");
    const forged = await customer.post("/staff/requests/1/status").type("form").send({ _csrf: token, status: "Cancelled" });
    assert.strictEqual(forged.status, 403);
});

test("an owner and a dispatcher can both open the dashboard", async () => {
    await matchedRequest();
    await unmatchedRequest();

    for (const roleName of ["owner", "dispatcher"]) {
        const agent = await staffAgent(roleName);
        const res = await agent.get("/staff");
        assert.strictEqual(res.status, 200);
        assert.match(res.text, /Needs Review<\/a>: 1/);
        assert.match(res.text, /Requested<\/a>: 1/);
    }
});

test("the request list filters by status and ignores an unknown filter", async () => {
    await matchedRequest("Ann Lee");
    await unmatchedRequest({ name: "Cy Doe", phone: "208-555-0303", address: "7 Birch Lane" });
    const agent = await staffAgent();

    const review = await agent.get("/staff/requests?status=Needs%20Review");
    assert.match(review.text, /Cy Doe/);
    assert.doesNotMatch(review.text, /Ann Lee/);

    for (const filter of ["Bogus", "' OR 1=1 --"]) {
        const res = await agent.get(`/staff/requests?status=${encodeURIComponent(filter)}`);
        assert.strictEqual(res.status, 200);
        assert.match(res.text, /Ann Lee/);
        assert.match(res.text, /Cy Doe/);
    }
});

test("a request moves from Requested through Scheduled to Completed with history", async () => {
    const { id } = await matchedRequest();
    const agent = await staffAgent();
    const page = `/staff/requests/${id}`;
    const when = daysAhead(5);

    const scheduled = await post(agent, page, `${page}/status`, { status: "Scheduled", scheduledDate: when, note: "gate open" });
    assert.strictEqual(scheduled.status, 302);
    assert.strictEqual(await statusOf(id), "Scheduled");

    const later = daysAhead(6);
    await post(agent, page, `${page}/status`, { status: "Scheduled", scheduledDate: later });
    await post(agent, page, `${page}/status`, { status: "Completed", note: "done" });
    assert.strictEqual(await statusOf(id), "Completed");

    const shown = await agent.get(page);
    assert.match(shown.text, new RegExp(`Scheduled Date</dt><dd>${later}`));
    assert.match(shown.text, new RegExp(`Scheduled for ${when} - gate open`));
    assert.match(shown.text, /by dispatcher@example.com/);
    assert.doesNotMatch(shown.text, /Mark /);

    const history = await ServiceRequest.historyFor(pool, id);
    assert.deepStrictEqual(history.map((entry) => {
        return entry.status;
    }), ["Requested", "Scheduled", "Scheduled", "Completed"]);
});

test("the server rejects moves the table does not allow, whatever the form sends", async () => {
    const { id } = await matchedRequest();
    const agent = await staffAgent();
    const page = `/staff/requests/${id}`;

    const skip = await post(agent, page, `${page}/status`, { status: "Completed" });
    assert.strictEqual(skip.status, 400);
    assert.match(skip.text, /not allowed/);

    const bogus = await post(agent, page, `${page}/status`, { status: "Bogus" });
    assert.strictEqual(bogus.status, 400);

    await post(agent, page, `${page}/status`, { status: "Cancelled" });
    const revive = await post(agent, page, `${page}/status`, { status: "Requested" });
    assert.strictEqual(revive.status, 400);
    assert.strictEqual(await statusOf(id), "Cancelled");
    assert.strictEqual((await ServiceRequest.historyFor(pool, id)).length, 2);
});

test("scheduling needs a real date from today up to a year ahead", async () => {
    const { id } = await matchedRequest();
    const agent = await staffAgent();
    const page = `/staff/requests/${id}`;

    for (const scheduledDate of ["", "2020-01-01", "not-a-date", "2099-01-01"]) {
        const res = await post(agent, page, `${page}/status`, { status: "Scheduled", scheduledDate });
        assert.strictEqual(res.status, 400, scheduledDate);
    }

    assert.strictEqual(await statusOf(id), "Requested");
});

test("an unmatched request can only be cancelled until it is matched", async () => {
    const id = await unmatchedRequest();
    const agent = await staffAgent();
    const page = `/staff/requests/${id}`;

    const forward = await post(agent, page, `${page}/status`, { status: "Requested" });
    assert.strictEqual(forward.status, 400);
    assert.match(forward.text, /Match this request/);
    assert.strictEqual(await statusOf(id), "Needs Review");

    const cancelled = await post(agent, page, `${page}/status`, { status: "Cancelled" });
    assert.strictEqual(cancelled.status, 302);
    assert.strictEqual(await statusOf(id), "Cancelled");
});

test("matching to an existing customer attaches the property and moves to Requested", async () => {
    const existing = await matchedRequest("Cy Doe", "7 Birch Lane");
    const id = await unmatchedRequest();
    const agent = await staffAgent();
    const page = `/staff/requests/${id}/match`;

    const shown = await agent.get(page);
    assert.match(shown.text, /7 Birch Lane, Rexburg/);

    const none = await post(agent, page, page, {});
    assert.strictEqual(none.status, 400);

    const matched = await post(agent, page, page, { propertyId: existing.propertyId });
    assert.strictEqual(matched.status, 302);
    assert.strictEqual(await statusOf(id), "Requested");

    const { rows } = await pool.query("SELECT customer_id, property_id FROM service_requests WHERE id = $1", [id]);
    assert.deepStrictEqual(rows[0], { customer_id: existing.customerId, property_id: existing.propertyId });

    // The match page now redirects, so take the CSRF token from the request page.
    const again = await post(agent, `/staff/requests/${id}`, page, { propertyId: existing.propertyId });
    assert.strictEqual(again.status, 400);
    assert.strictEqual((await ServiceRequest.historyFor(pool, id)).length, 2);
});

test("matching as a new customer creates the customer and property from the typed details", async () => {
    const id = await unmatchedRequest();
    const agent = await staffAgent();
    const page = `/staff/requests/${id}/match`;

    const missing = await post(agent, page, `${page}/new`, { city: "" });
    assert.strictEqual(missing.status, 400);
    assert.strictEqual(await statusOf(id), "Needs Review");

    const created = await post(agent, page, `${page}/new`, { city: "Rexburg", zip: "83440" });
    assert.strictEqual(created.status, 302);
    assert.strictEqual(await statusOf(id), "Requested");

    const { rows } = await pool.query(
        `SELECT customers.name, properties.street, properties.city FROM service_requests
         JOIN customers ON customers.id = service_requests.customer_id
         JOIN properties ON properties.id = service_requests.property_id
         WHERE service_requests.id = $1`, [id]);
    assert.deepStrictEqual(rows[0], { name: "Cy Doe", street: "7 Birch Lane", city: "Rexburg" });
});

test("contact details typed by a stranger are escaped for staff", async () => {
    const id = await unmatchedRequest({ name: "<script>alert(1)</script>", phone: "208-555-0303", address: "7 Birch Lane" });
    const agent = await staffAgent();

    for (const path of [`/staff/requests/${id}`, `/staff/requests/${id}/match`, "/staff/requests"]) {
        const res = await agent.get(path);
        assert.doesNotMatch(res.text, /<script>alert/);
        assert.match(res.text, /&lt;script&gt;/);
    }
});

test("customer search matches name, phone and street, and treats % as plain text", async () => {
    await matchedRequest("Ann Lee", "12 Oak Street");
    await matchedRequest("Bo Kim", "9 Pine Avenue", "208-555-0202");
    const agent = await staffAgent();

    const byName = await agent.get("/staff/customers?q=ann");
    assert.match(byName.text, /Ann Lee/);
    assert.doesNotMatch(byName.text, /Bo Kim/);

    const byStreet = await agent.get("/staff/customers?q=9%20pine%20ave");
    assert.match(byStreet.text, /Bo Kim/);
    assert.doesNotMatch(byStreet.text, /Ann Lee/);

    const byPhone = await agent.get("/staff/customers?q=555-0101");
    assert.match(byPhone.text, /Ann Lee/);
    assert.doesNotMatch(byPhone.text, /Bo Kim/);

    // If % were a LIKE wildcard, "a%n" would match "ann". It is stripped to "a n", which matches no one.
    const wildcard = await agent.get("/staff/customers?q=a%25n");
    assert.doesNotMatch(wildcard.text, /Ann Lee/);

    const everyone = await agent.get("/staff/customers");
    assert.match(everyone.text, /Ann Lee/);
    assert.match(everyone.text, /Bo Kim/);
});

test("a staff-made link shows once, stores only a hash, works, and can be revoked", async () => {
    const { customerId } = await matchedRequest();
    const agent = await staffAgent();
    const page = `/staff/customers/${customerId}`;

    const made = await post(agent, page, `${page}/links`, {});
    assert.strictEqual(made.status, 200);
    assert.match(made.headers["cache-control"], /no-store/);
    const link = made.text.match(/value="(http[^"]+\/l\/([^"]+))"/);
    assert.ok(link, "the new link is shown");

    const stored = await pool.query("SELECT token_hash, created_by FROM access_links");
    assert.strictEqual(stored.rows.length, 1);
    assert.notStrictEqual(stored.rows[0].token_hash, link[2]);
    assert.ok(stored.rows[0].created_by);

    const reload = await agent.get(page);
    assert.doesNotMatch(reload.text, new RegExp(link[2]));

    const visitor = request(server);
    assert.strictEqual((await visitor.get(`/l/${link[2]}`)).status, 200);

    const linkId = reload.text.match(/links\/(\d+)\/revoke/)[1];
    const other = await Customer.create(pool, { name: "Bo Kim", phone: "208-555-0202" });
    const wrongOwner = await post(agent, page, `/staff/customers/${other}/links/${linkId}/revoke`, {});
    assert.strictEqual(wrongOwner.status, 404);

    const revoked = await post(agent, page, `${page}/links/${linkId}/revoke`, {});
    assert.strictEqual(revoked.status, 302);
    assert.strictEqual((await visitor.get(`/l/${link[2]}`)).status, 404);
    assert.match((await agent.get(page)).text, /Revoked/);
});

test("a missing or malformed id is a 404", async () => {
    const agent = await staffAgent();

    for (const path of ["/staff/requests/99999", "/staff/requests/abc", "/staff/customers/99999", "/staff/requests/99999/match"]) {
        assert.strictEqual((await agent.get(path)).status, 404, path);
    }
});
