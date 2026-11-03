import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as ServiceRequest from "./models/serviceRequest.js";
import * as Review from "./models/review.js";
import * as AccessLink from "./models/accessLink.js";
import * as ImportBatch from "./models/importBatch.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("custclear");
const pool = db.pool;
let app;
let server;
let customerId;
let propertyId;
let batchId;

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
    customerId = await Customer.create(pool, { name: "Ann Lee", phone: "(208) 555-0101", email: "ann@example.com" });
    propertyId = await Property.create(pool, customerId, { street: "12 Oak Street", city: "Rexburg", zip: "83440" });
    const requestId = await ServiceRequest.create(pool, {
        customerId, propertyId, serviceTypeId: 1, preferredDate: "2030-01-01",
    });
    await pool.query("UPDATE service_requests SET status_id = (SELECT id FROM request_statuses WHERE name = 'Completed')");
    await Review.save(pool, { requestId, customerId, rating: 5, body: "Great" });
    await AccessLink.create(pool, { customerId });
    batchId = await ImportBatch.create(pool, {
        sheetId: "abc", sheetName: "Jobs", seasonYear: 2026, planHash: "a".repeat(64),
        counts: { customersCreated: 1, propertiesCreated: 1, jobsCreated: 0, jobsExisting: 0, rowsSkipped: 0 },
    });
    await pool.query("UPDATE customers SET import_batch_id = $1", [batchId]);
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



async function addHandMadeCustomer() {
    const id = await Customer.create(pool, { name: "Bo Kim" });
    await Property.create(pool, id, { street: "9 Elm Street", city: "Rexburg", zip: "83440" });
    return id;
}

async function count(table) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
}

const SAW = { customers: 1, properties: 1, requests: 1, reviews: 1, links: 1 };
const batchPage = () => {
    return `/admin/clear/batches/${batchId}`;
};

test("the clear page lists batches with the customers still on file", async () => {
    const owner = await agentFor("owner");

    const res = await owner.get("/admin/clear");

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /Batch \d+: Jobs, season 2026/);
    assert.match(res.text, /1 customer on file/);
});

test("a batch delete removes the batch's customers and what hangs off them, and leaves hand-made ones", async () => {
    await addHandMadeCustomer();
    const owner = await agentFor("owner");

    const confirm = await owner.get(batchPage());
    assert.match(confirm.text, /1 customer\b/);
    const res = await send(owner, batchPage(), batchPage(), SAW);

    assert.strictEqual(res.status, 303);
    assert.strictEqual(res.headers.location, "/admin/clear?deleted=1");
    assert.deepStrictEqual(
        [await count("customers"), await count("properties"), await count("service_requests"), await count("reviews"), await count("access_links")],
        [1, 1, 0, 0, 0],
    );
    assert.strictEqual(await count("import_batches"), 1);
});

test("a batch delete is refused when the counts changed since the owner looked", async () => {
    const owner = await agentFor("owner");
    const stale = { ...SAW, requests: 0 };

    const res = await send(owner, batchPage(), batchPage(), stale);

    assert.strictEqual(res.status, 409);
    assert.match(res.text, /numbers changed/);
    assert.strictEqual(await count("customers"), 1);
});

test("missing or malformed counts delete nothing", async () => {
    const owner = await agentFor("owner");

    const missing = await send(owner, batchPage(), batchPage(), {});
    const junk = await send(owner, batchPage(), batchPage(), { ...SAW, customers: "1 OR 1=1" });

    assert.deepStrictEqual([missing.status, junk.status], [409, 409]);
    assert.strictEqual(await count("customers"), 1);
});

test("delete all needs the typed phrase, then removes every customer but keeps logins and batches", async () => {
    await addHandMadeCustomer();
    const owner = await agentFor("owner");
    const saw = { customers: 2, properties: 2, requests: 1, reviews: 1, links: 1 };

    const wrong = await send(owner, "/admin/clear/all", "/admin/clear/all", { ...saw, phrase: "yes" });
    assert.strictEqual(wrong.status, 400);
    assert.strictEqual(await count("customers"), 2);

    const res = await send(owner, "/admin/clear/all", "/admin/clear/all", { ...saw, phrase: " Delete All Customers " });
    assert.strictEqual(res.status, 303);
    assert.strictEqual(res.headers.location, "/admin/clear?deleted=2");
    assert.strictEqual(await count("customers"), 0);
    assert.strictEqual(await count("properties"), 0);
    assert.strictEqual(await count("users"), 1);
    assert.strictEqual(await count("import_batches"), 1);
});

test("a dispatcher and a visitor cannot reach any clear page or post", async () => {
    const dispatcher = await agentFor("dispatcher");
    const visitor = request.agent(server);

    for (const agent of [dispatcher, visitor]) {
        for (const path of ["/admin/clear", batchPage(), "/admin/clear/all"]) {
            const res = await agent.get(path);
            assert.ok([302, 403].includes(res.status), `${path} ${res.status}`);
        }
    }

    const res = await send(dispatcher, "/staff", "/admin/clear/all", { ...SAW, phrase: "delete all customers" });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(await count("customers"), 1);
});

test("an unknown batch gives 404", async () => {
    const owner = await agentFor("owner");

    assert.strictEqual((await owner.get("/admin/clear/batches/9999")).status, 404);
});
