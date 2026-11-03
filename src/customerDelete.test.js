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
import { hashPassword } from "./utils/password.js";

const db = testDb("custdelete");
const pool = db.pool;
let app;
let server;
let customerId;
let propertyId;

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


const page = () => {
    return `/staff/customers/${customerId}/delete`;
};

async function count(table) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
}

test("the confirmation page lists what the delete will take, and deletes nothing", async () => {
    const owner = await agentFor("owner");

    const res = await owner.get(page());

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /1 property/);
    assert.match(res.text, /1 service request/);
    assert.match(res.text, /1 review/);
    assert.match(res.text, /1 scheduling link/);
    assert.strictEqual(await count("customers"), 1);
});

test("an owner deletes a customer, and the properties, requests, history, reviews and links go with it", async () => {
    const owner = await agentFor("owner");

    const res = await send(owner, page(), page(), {});

    assert.strictEqual(res.status, 303);
    assert.strictEqual(res.headers.location, "/staff/customers");
    for (const table of ["customers", "properties", "service_requests", "status_history", "reviews", "access_links"]) {
        assert.strictEqual(await count(table), 0, table);
    }
});

test("deleting one customer leaves another customer alone", async () => {
    const other = await Customer.create(pool, { name: "Bo Kim" });
    await Property.create(pool, other, { street: "9 Elm Street", city: "Rexburg", zip: "83440" });
    const owner = await agentFor("owner");

    await send(owner, page(), page(), {});

    assert.strictEqual(await count("customers"), 1);
    assert.strictEqual(await count("properties"), 1);
});

test("a dispatcher is refused the page and the delete, and nothing is removed", async () => {
    const dispatcher = await agentFor("dispatcher");

    assert.strictEqual((await dispatcher.get(page())).status, 403);
    const res = await send(dispatcher, `/staff/customers/${customerId}`, page(), {});

    assert.strictEqual(res.status, 403);
    assert.strictEqual(await count("customers"), 1);
});

test("only an owner sees the delete link", async () => {
    const owner = await agentFor("owner");
    const dispatcher = await agentFor("dispatcher");

    assert.ok((await owner.get(`/staff/customers/${customerId}`)).text.includes(page()));
    assert.ok(!(await dispatcher.get(`/staff/customers/${customerId}`)).text.includes(page()));
});

test("a customer that does not exist gives 404, and a post without the CSRF token is refused", async () => {
    const owner = await agentFor("owner");

    assert.strictEqual((await owner.get("/staff/customers/9999/delete")).status, 404);
    const res = await owner.post(page()).type("form").send({});

    assert.strictEqual(res.status, 403);
    assert.strictEqual(await count("customers"), 1);
});
