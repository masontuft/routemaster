import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as Area from "./models/area.js";
import * as ServiceRequest from "./models/serviceRequest.js";
import * as AccessLink from "./models/accessLink.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("rebookpages");
const pool = db.pool;
let app;
let server;
let areaId;

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
    areaId = await Area.create(pool, "Oakwood");
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

async function send(agent, pagePath, action, fields) {
    const _csrf = await tokenFrom(agent, pagePath);
    return agent.post(action).type("form").send({ _csrf, ...fields });
}

async function agentFor(roleName) {
    const agent = request.agent(server);
    const email = `${roleName}@example.com`;
    await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName });
    await send(agent, "/login", "/login", { email, password: "longenough" });
    return agent;
}

// A customer in an area who was served last year, with a phone that can be texted unless phone is given.
async function servedLastYear(name, { area = areaId, phone = "208-555-0101", street = "1 Elm St" } = {}) {
    const id = await Customer.create(pool, { name, phone });
    const propertyId = await Property.create(pool, id, { street, city: "Rexburg" });
    await pool.query("UPDATE properties SET subdivision_id = $2 WHERE id = $1", [propertyId, area]);
    const requestId = await ServiceRequest.create(pool, {
        customerId: id, propertyId, serviceTypeId: 1, preferredDate: "2025-10-01",
    });
    await pool.query(
        "UPDATE service_requests SET status_id = (SELECT id FROM request_statuses WHERE name = 'Completed') WHERE id = $1",
        [requestId],
    );
    return id;
}

async function count(table) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
}

const PAGE = () => {
    return `/staff/rebooking?areaId=${areaId}&year=2026`;
};
const make = (agent, fields = {}) => {
    return send(agent, PAGE(), "/staff/rebooking/links", {
        areaId, year: "2026", days: "30", template: "Hi {name}: {link}", ...fields,
    });
};

function linkTokens(res) {
    return [...res.text.matchAll(/\/l\/([\w-]{20,})/g)].map((match) => {
        return match[1];
    });
}

test("the page sorts customers into groups, ticks the outreach list, and gives booked customers no box", async () => {
    const ann = await servedLastYear("Ann Lee");
    await servedLastYear("No Phone", { phone: null, street: "2 Elm St" });
    const booked = await servedLastYear("Already Booked", { street: "3 Elm St" });
    await ServiceRequest.create(pool, {
        customerId: booked, propertyId: (await Property.listForCustomer(pool, booked))[0].id,
        serviceTypeId: 1, preferredDate: "2026-10-10",
    });
    const dispatcher = await agentFor("dispatcher");

    const res = await dispatcher.get(PAGE());

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /2 not yet booked, 0 declined, 0 never served,\s+1 already booked/);
    assert.match(res.text, new RegExp(`value="${ann}" data-group="not_yet_booked" data-textable="1" aria-label="Make a link for Ann Lee" checked`));
    assert.doesNotMatch(res.text, /aria-label="Make a link for No Phone" checked/);
    assert.doesNotMatch(res.text, /aria-label="Make a link for Already Booked"/);
    assert.match(res.headers["cache-control"], /no-store/);
});

test("making links covers only the ticked customers, records a batch, and each link opens", async () => {
    const ann = await servedLastYear("Ann Lee");
    await servedLastYear("Bob Ray", { street: "2 Elm St" });
    const dispatcher = await agentFor("dispatcher");

    const res = await make(dispatcher, { customerIds: String(ann) });

    assert.strictEqual(res.status, 200);
    assert.match(res.headers["cache-control"], /no-store/);
    assert.match(res.text, /Hi Ann Lee: /);
    assert.doesNotMatch(res.text, /Bob Ray/);
    const [token] = linkTokens(res);
    assert.ok(token, "the page shows a link");
    assert.strictEqual(await count("access_links"), 1);
    const batch = await pool.query("SELECT links_created, subdivision_id FROM link_batches");
    assert.deepStrictEqual(batch.rows, [{ links_created: 1, subdivision_id: areaId }]);
    assert.strictEqual((await request(server).get(`/l/${token}`)).status, 200);
});

test("a ticked id from another area is ignored, so a forged form reaches no outside customer", async () => {
    const otherArea = await Area.create(pool, "Pine Hills");
    const inside = await servedLastYear("Inside");
    const outside = await servedLastYear("Outside", { area: otherArea, street: "9 Pine Rd" });
    const dispatcher = await agentFor("dispatcher");

    const res = await make(dispatcher, { customerIds: [String(inside), String(outside)] });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(await count("access_links"), 1);
    assert.doesNotMatch(res.text, /Outside/);
});

test("a customer with a working link is skipped unless asked for", async () => {
    const ann = await servedLastYear("Ann Lee");
    await AccessLink.create(pool, { customerId: ann, days: 30 });
    const dispatcher = await agentFor("dispatcher");

    const skipped = await make(dispatcher, { customerIds: String(ann) });
    assert.strictEqual(await count("access_links"), 1);
    assert.match(skipped.text, /1 customer was skipped/);

    await make(dispatcher, { customerIds: String(ann), includeActive: "1" });
    assert.strictEqual(await count("access_links"), 2);
});

test("bad input makes nothing: no ticks, no year, a bad lifetime, a message without the link", async () => {
    const ann = await servedLastYear("Ann Lee");
    const dispatcher = await agentFor("dispatcher");

    const none = await make(dispatcher);
    const noYear = await make(dispatcher, { customerIds: String(ann), year: "soon" });
    const badDays = await make(dispatcher, { customerIds: String(ann), days: "500" });
    const noLink = await make(dispatcher, { customerIds: String(ann), template: "Hello" });

    assert.strictEqual(none.status, 400);
    assert.match(none.text, /Tick at least one customer/);
    assert.match(noYear.text, /Choose a year/);
    assert.match(badDays.text, /1 to 120 days/);
    assert.match(noLink.text, /includes \{link\}/);
    assert.strictEqual(await count("access_links"), 0);
    assert.strictEqual(await count("link_batches"), 0);
});

test("customers and signed-out visitors cannot use rebooking", async () => {
    const ann = await servedLastYear("Ann Lee");
    const customer = await agentFor("customer");

    assert.strictEqual((await request(server).get("/staff/rebooking")).status, 302);
    assert.strictEqual((await customer.get("/staff/rebooking")).status, 403);
    const res = await customer.post("/staff/rebooking/links").type("form").send({ areaId, customerIds: String(ann) });
    assert.notStrictEqual(res.status, 200);
    assert.strictEqual(await count("access_links"), 0);
});

test("the page offers all areas, and the buttons and script that select a whole group", async () => {
    await servedLastYear("Ann Lee");
    const dispatcher = await agentFor("dispatcher");

    const res = await dispatcher.get(`/staff/rebooking?areaId=${areaId}&year=2026`);

    assert.match(res.text, /<option value="all" >All areas \(every customer\)<\/option>/);
    assert.match(res.text, /data-select="all" data-group="not_yet_booked">Select All/);
    assert.match(res.text, /data-select="none" data-group="not_yet_booked">Clear/);
    assert.match(res.text, /data-group="not_yet_booked" data-textable="1"/);
    assert.match(res.text, /<script type="module" src="\/js\/rebooking.js">/);
    const script = await request(server).get("/js/rebooking.js");
    assert.strictEqual(script.status, 200);
    assert.match(script.headers["content-type"], /javascript/);
});

test("all areas lists every customer with a property, in any area or none, once each", async () => {
    const other = await Area.create(pool, "Pine Hills");
    await servedLastYear("Inside");
    await servedLastYear("Elsewhere", { area: other, street: "9 Pine Rd" });
    const noArea = await Customer.create(pool, { name: "No Area", phone: "208-555-0102" });
    await Property.create(pool, noArea, { street: "5 Oak St", city: "Rexburg" });
    await Customer.create(pool, { name: "No Property", phone: "208-555-0103" });
    const dispatcher = await agentFor("dispatcher");

    const res = await dispatcher.get("/staff/rebooking?areaId=all&year=2026");

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /<option value="all" selected>/);
    assert.match(res.text, /2 not yet booked, 0 declined, 1 never served,\s+0 already booked/);
    assert.match(res.text, /Elsewhere/);
    assert.match(res.text, /No Area/);
    assert.doesNotMatch(res.text, /No Property/);
});

test("making links for all areas makes a batch for each owning area and shows a section for each", async () => {
    const other = await Area.create(pool, "Pine Hills");
    const inside = await servedLastYear("Inside");
    const outside = await servedLastYear("Elsewhere", { area: other, street: "9 Pine Rd" });
    const dispatcher = await agentFor("dispatcher");

    const res = await send(dispatcher, "/staff/rebooking?areaId=all&year=2026", "/staff/rebooking/links", {
        areaId: "all", year: "2026", days: "30", template: "Hi {name}: {link}",
        customerIds: [String(inside), String(outside)],
    });

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /2 links made in 2 areas/);
    assert.match(res.text, /<h2>Pine Hills<\/h2>/);
    assert.match(res.text, /Hi Inside: /);
    assert.match(res.text, /Hi Elsewhere: /);
    assert.doesNotMatch(res.text, /Areas That Failed/);
    assert.strictEqual(await count("access_links"), 2);
    const batches = await pool.query("SELECT links_created, subdivision_id FROM link_batches ORDER BY id");
    assert.deepStrictEqual(batches.rows.map((row) => {
        return row.links_created;
    }), [1, 1]);
    assert.ok(batches.rows.every((row) => {
        return row.subdivision_id !== null;
    }));
});

test("all areas takes more ticked customers than one batch holds, and the page says there is no limit", async () => {
    await servedLastYear("Ann Lee");
    const dispatcher = await agentFor("dispatcher");
    const page = await dispatcher.get("/staff/rebooking?areaId=all&year=2026");
    const ids = Array.from({ length: 1100 }, (value, index) => {
        return String(900000 + index);
    });

    const res = await send(dispatcher, "/staff/rebooking?areaId=all&year=2026", "/staff/rebooking/links", {
        areaId: "all", year: "2026", days: "30", template: "Hi {name}: {link}", customerIds: ids,
    });

    assert.doesNotMatch(page.text, /data-limit/);
    assert.match(page.text, /so there is no limit/);
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /No links were made/);
});

test("all areas lists an area it could not finish and still makes the others", async () => {
    const big = await Area.create(pool, "Big Hills");
    const inside = await servedLastYear("Inside");
    await pool.query(
        `INSERT INTO customers (name, name_normalized, phone, phone_normalized)
         SELECT 'C' || g, 'c' || g, '20855' || lpad(g::text, 5, '0'), '20855' || lpad(g::text, 5, '0')
         FROM generate_series(1, 501) g`,
    );
    await pool.query(
        `INSERT INTO properties (customer_id, street, city, address_normalized, subdivision_id)
         SELECT id, '1 Elm St', 'Rexburg', '1 elm st', $1 FROM customers WHERE name LIKE 'C%'`,
        [big],
    );
    const crowd = await pool.query("SELECT id FROM customers WHERE name LIKE 'C%'");
    const dispatcher = await agentFor("dispatcher");

    const res = await send(dispatcher, "/staff/rebooking?areaId=all&year=2026", "/staff/rebooking/links", {
        areaId: "all", year: "2026", days: "30", template: "Hi {name}: {link}",
        customerIds: [String(inside), ...crowd.rows.map((row) => {
            return String(row.id);
        })],
    });

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /1 link made in 1 area/);
    assert.match(res.text, /Areas That Failed/);
    assert.match(res.text, /Big Hills: 501 customers is more than the 500 a batch holds, so tick fewer/);
    assert.strictEqual(await count("access_links"), 1);
});

test("all areas still needs ticks, and a bad area value is refused", async () => {
    await servedLastYear("Ann Lee");
    const dispatcher = await agentFor("dispatcher");

    const none = await send(dispatcher, "/staff/rebooking?areaId=all&year=2026", "/staff/rebooking/links", {
        areaId: "all", year: "2026", days: "30", template: "Hi {name}: {link}",
    });
    const junk = await send(dispatcher, "/staff/rebooking?areaId=all&year=2026", "/staff/rebooking/links", {
        areaId: "everything", year: "2026", days: "30", template: "Hi {name}: {link}", customerIds: "1",
    });

    assert.strictEqual(none.status, 400);
    assert.match(none.text, /Tick at least one customer/);
    assert.strictEqual(junk.status, 400);
    assert.match(junk.text, /Choose an area/);
    assert.strictEqual(await count("access_links"), 0);
});
