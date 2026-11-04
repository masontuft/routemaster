import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as Area from "./models/area.js";
import * as AccessLink from "./models/accessLink.js";
import * as LinkBatch from "./models/linkBatch.js";
import { toCsv, csvCell } from "./utils/csv.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("linkpages");
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





let areaId;

beforeEach(async () => {
    areaId = await Area.create(pool, "Oakwood");
});

async function customerIn(area, name, phone, street = "1 Elm St") {
    const id = await Customer.create(pool, { name, phone });
    const propertyId = await Property.create(pool, id, { street, city: "Rexburg" });
    await pool.query("UPDATE properties SET subdivision_id = $2 WHERE id = $1", [propertyId, area]);
    return id;
}

async function count(table) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
}

const PAGE = "/staff/link-batches/new";
const make = (agent, fields = {}) => {
    return send(agent, `${PAGE}?areaId=${areaId}`, "/staff/link-batches", {
        areaId, days: "30", template: "Hi {name}: {link}", ...fields,
    });
};

function csvOf(res) {
    return res.text.match(/<textarea id="csv-\d+"[^>]*>([\s\S]*?)<\/textarea>/)[1].replaceAll("&#34;", '"').replaceAll("&amp;", "&");
}

test("csv cells are quoted when needed and formula starters get a leading quote mark", () => {
    assert.strictEqual(csvCell("plain"), "plain");
    assert.strictEqual(csvCell('say "hi", now'), '"say ""hi"", now"');
    assert.strictEqual(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
    assert.strictEqual(csvCell("+1 208"), "'+1 208");
    assert.strictEqual(csvCell("-5"), "'-5");
    assert.strictEqual(csvCell("@cmd"), "'@cmd");
    assert.strictEqual(csvCell(null), "");
    assert.strictEqual(toCsv([["a", "b,c"], ["1", "2"]]), 'a,"b,c"\r\n1,2\r\n');
});

test("the preview shows the counts and nothing is made until the form is posted", async () => {
    await customerIn(areaId, "Ann Lee", "208-555-0101");
    await customerIn(areaId, "No Phone", null, "2 Elm St");
    const dispatcher = await agentFor("dispatcher");

    const page = await dispatcher.get(`${PAGE}?areaId=${areaId}`);

    assert.strictEqual(page.status, 200);
    assert.match(page.text, /1 customer gets a new link/);
    assert.match(page.text, /1 customer has no usable phone/);
    assert.match(page.headers["cache-control"], /no-store/);
    assert.strictEqual(await count("access_links"), 0);
});

test("making links lists only that area's customers, each link works, and the page is not cacheable", async () => {
    const ann = await customerIn(areaId, "Ann Lee", "(208) 555-0101");
    const other = await Area.create(pool, "Pine Hills");
    await customerIn(other, "Bo Kim", "208-555-0102");
    const dispatcher = await agentFor("dispatcher");

    const res = await make(dispatcher);

    assert.strictEqual(res.status, 200);
    assert.match(res.headers["cache-control"], /no-store/);
    assert.ok(res.text.includes("Ann Lee") && !res.text.includes("Bo Kim"));
    const rows = csvOf(res).trim().split("\r\n");
    assert.strictEqual(rows[0], "name,phone,message");
    const [, phone, message] = rows[1].match(/^Ann Lee,(\d+),(.*)$/);
    assert.strictEqual(phone, "2085550101");
    const token = message.match(/\/l\/([\w-]+)/)[1];
    assert.deepStrictEqual(await AccessLink.findValid(pool, token), { id: 1, customerId: ann });
    assert.match((await request(server).get(`/l/${token}`)).text, /Continue/);
});

test("running it again makes no second link for a customer who already has one", async () => {
    await customerIn(areaId, "Ann Lee", "208-555-0101");
    const owner = await agentFor("owner");

    await make(owner);
    const again = await make(owner);

    assert.strictEqual(again.status, 200);
    assert.strictEqual(await count("access_links"), 1);
    assert.match(again.text, /1 customer was skipped/);
});

test("customers without a usable phone are listed with an edit link and get no link", async () => {
    const id = await customerIn(areaId, "No Phone", null);
    await customerIn(areaId, "Ann Lee", "208-555-0101", "2 Elm St");
    const owner = await agentFor("owner");

    const res = await make(owner);

    assert.ok(res.text.includes(`href="/staff/customers/${id}/edit"`));
    assert.strictEqual(await count("access_links"), 1);
});

test("a name that looks like a template marker or a replacement pattern is inserted as plain text", async () => {
    await customerIn(areaId, "A$&{link}B", "208-555-0101");
    const owner = await agentFor("owner");

    const res = await make(owner, { template: "Dear {name}, {link}" });

    const message = csvOf(res).trim().split("\r\n")[1];
    assert.ok(message.includes("Dear A$&{link}B, "));
    assert.strictEqual((message.match(/\/l\//g) ?? []).length, 1);
});

test("a bad area, lifetime or message makes nothing", async () => {
    await customerIn(areaId, "Ann Lee", "208-555-0101");
    const owner = await agentFor("owner");
    const cases = [
        { areaId: "" }, { areaId: "abc" }, { days: "0" }, { days: "121" }, { days: "soon" },
        { template: "no marker here" }, { template: "" }, { template: `{link}${"x".repeat(500)}` },
    ];

    for (const fields of cases) {
        assert.strictEqual((await make(owner, fields)).status, 400, JSON.stringify(fields).slice(0, 40));
    }

    assert.strictEqual((await make(owner, { areaId: 9999 })).status, 404);
    assert.strictEqual(await count("access_links"), 0);
    assert.strictEqual(await count("link_batches"), 0);
});

test("a batch over the cap is refused with a message", async () => {
    await pool.query(
        `INSERT INTO customers (name, name_normalized, phone, phone_normalized)
         SELECT 'C' || g, 'c' || g, '20855' || lpad(g::text, 5, '0'), '20855' || lpad(g::text, 5, '0')
         FROM generate_series(1, $1::int) g`,
        [LinkBatch.MAX_BATCH + 1],
    );
    await pool.query(
        `INSERT INTO properties (customer_id, street, city, address_normalized, subdivision_id)
         SELECT id, '1 Elm St', 'Rexburg', '1 elm st', $1 FROM customers`,
        [areaId],
    );
    const owner = await agentFor("owner");

    const res = await make(owner);

    assert.strictEqual(res.status, 400);
    assert.match(res.text, /at most 500/);
    assert.strictEqual(await count("access_links"), 0);
});

test("a customer and a visitor are refused, and a post without the CSRF token makes nothing", async () => {
    await customerIn(areaId, "Ann Lee", "208-555-0101");
    const customer = await agentFor("customer");
    const visitor = request.agent(server);

    assert.strictEqual((await customer.get(PAGE)).status, 403);
    assert.strictEqual((await visitor.get(PAGE)).status, 302);
    const owner = await agentFor("owner");
    const noToken = await owner.post("/staff/link-batches").type("form").send({ areaId, days: "30", template: "{link}" });
    assert.strictEqual(noToken.status, 403);
    const denied = await send(customer, "/properties/new", "/staff/link-batches", { areaId, days: "30", template: "{link}" });
    assert.strictEqual(denied.status, 403);
    assert.strictEqual(await count("access_links"), 0);
});
