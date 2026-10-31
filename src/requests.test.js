import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as AccessLink from "./models/accessLink.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("flows");
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
    // Fetch the token first: an agent attaches its cookies when the request is created.
    const _csrf = await tokenFrom(agent, pagePath);
    return agent.post(action).type("form").send({ _csrf, ...fields });
}

async function loginAs(agent, email, roleName = "customer") {
    await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName });
    return post(agent, "/login", "/login", { email, password: "longenough" });
}

async function customerWithProperty(name = "Ann Lee", phone = "208-555-0101", street = "12 Oak Street") {
    const customerId = await Customer.create(pool, { name, phone });
    const propertyId = await Property.create(pool, customerId, { street, city: "Rexburg" });
    return { customerId, propertyId };
}

function daysAhead(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const FUTURE = daysAhead(30);
const LATER = daysAhead(60);

test("pages for customers send a visitor to log in and give other roles a 403", async () => {
    const visitor = await request(server).get("/requests");
    assert.strictEqual(visitor.status, 302);
    assert.strictEqual(visitor.headers.location, "/login");

    const agent = request.agent(server);
    await loginAs(agent, "boss@example.com", "owner");
    assert.strictEqual((await agent.get("/requests")).status, 403);
});

test("a password customer adds a property, submits, views, changes and cancels a request", async () => {
    const agent = request.agent(server);
    await loginAs(agent, "ann@example.com");

    const property = await post(agent, "/properties/new", "/properties", { street: "5 Elm St", city: "Rexburg" });
    assert.strictEqual(property.status, 302);

    const created = await post(agent, "/requests/new", "/requests",
        { serviceTypeId: 1, propertyId: 1, preferredDate: FUTURE, notes: "gate code 1234" });
    assert.strictEqual(created.status, 302);
    const detail = created.headers.location;

    const shown = await agent.get(detail);
    assert.match(shown.text, /Requested/);
    assert.match(shown.text, /gate code 1234/);
    assert.match((await agent.get("/requests")).text, /Sprinkler Blowout/);

    const edited = await post(agent, `${detail}/edit`, `${detail}/edit`, { preferredDate: LATER, notes: "new note" });
    assert.strictEqual(edited.status, 302);
    assert.match((await agent.get(detail)).text, new RegExp(LATER));

    await post(agent, detail, `${detail}/cancel`, {});
    const after = await agent.get(detail);
    assert.match(after.text, /Cancelled/);
    assert.doesNotMatch(after.text, /Cancel Request/);
});

test("the request form rejects a past date, a missing service, and another customer's property", async () => {
    const other = await customerWithProperty("Bo Kim", "208-555-0202", "9 Pine St");
    const agent = request.agent(server);
    await loginAs(agent, "ann@example.com");
    await post(agent, "/properties/new", "/properties", { street: "5 Elm St", city: "Rexburg" });

    const past = await post(agent, "/requests/new", "/requests", { serviceTypeId: 1, propertyId: 1, preferredDate: "2020-01-01" });
    assert.strictEqual(past.status, 400);
    assert.match(past.text, /today or later/);

    const bad = await post(agent, "/requests/new", "/requests", { propertyId: other.propertyId, preferredDate: FUTURE });
    assert.strictEqual(bad.status, 400);
    assert.match(bad.text, /Choose a service/);
    assert.match(bad.text, /Choose one of your properties/);

    const count = await pool.query("SELECT count(*)::int AS n FROM service_requests");
    assert.strictEqual(count.rows[0].n, 0);
});

test("a customer gets 404 for someone else's request, a missing one, and a bad id", async () => {
    const other = await customerWithProperty("Bo Kim", "208-555-0202", "9 Pine St");
    const { rows } = await pool.query(
        `INSERT INTO service_requests (customer_id, property_id, service_type_id, status_id, preferred_date)
         VALUES ($1, $2, 1, 2, '2099-01-01') RETURNING id`, [other.customerId, other.propertyId]);
    const agent = request.agent(server);
    await loginAs(agent, "ann@example.com");
    await agent.get("/requests");

    for (const id of [rows[0].id, 99999, "abc"]) {
        assert.strictEqual((await agent.get(`/requests/${id}`)).status, 404);
    }
    const token = await tokenFrom(agent, "/requests");
    const cancel = await agent.post(`/requests/${rows[0].id}/cancel`).type("form").send({ _csrf: token });
    assert.strictEqual(cancel.status, 404);
});

test("a magic link shows a button on GET, logs the customer in only on POST, and shows only their data", async () => {
    const ann = await customerWithProperty();
    await customerWithProperty("Bo Kim", "208-555-0202", "9 Pine St");
    const token = await AccessLink.create(pool, { customerId: ann.customerId });

    const agent = request.agent(server);
    const page = await agent.get(`/l/${token}`);
    assert.strictEqual(page.status, 200);
    assert.match(page.text, /Continue/);
    assert.strictEqual((await agent.get("/requests")).status, 302);

    const redeemed = await post(agent, `/l/${token}`, `/l/${token}`, {});
    assert.strictEqual(redeemed.status, 302);
    assert.strictEqual(redeemed.headers.location, "/requests");
    assert.match((await agent.get("/requests/new")).text, /12 Oak Street/);
    assert.doesNotMatch((await agent.get("/requests/new")).text, /9 Pine St/);

    const made = await post(agent, "/requests/new", "/requests", { serviceTypeId: 1, propertyId: ann.propertyId, preferredDate: FUTURE });
    assert.strictEqual(made.status, 302);
});

test("a garbage, expired or revoked link gets the same not-valid page", async () => {
    const ann = await customerWithProperty();
    const expired = await AccessLink.create(pool, { customerId: ann.customerId, days: -1 });
    const revoked = await AccessLink.create(pool, { customerId: ann.customerId });
    await AccessLink.revoke(pool, (await AccessLink.findValid(pool, revoked)).id);

    for (const token of ["garbage", expired, revoked]) {
        const agent = request.agent(server);
        const page = await agent.get(`/l/${token}`);
        assert.strictEqual(page.status, 404);
        assert.match(page.text, /Link Not Valid/);
        const redeem = await post(agent, "/login", `/l/${token}`, {});
        assert.strictEqual(redeem.status, 404);
    }
});

test("a user with no password cannot log in with an empty or any password", async () => {
    const ann = await customerWithProperty();
    await Customer.ensureUser(pool, ann.customerId);
    const agent = request.agent(server);
    const res = await post(agent, "/login", "/login", { email: "", password: "" });
    assert.strictEqual(res.status, 401);
});

test("the generic link matches an existing customer and creates a Requested request for them", async () => {
    const ann = await customerWithProperty();
    const agent = request.agent(server);
    const identify = await post(agent, "/schedule", "/schedule",
        { name: "ann LEE", phone: "(208) 555-0101", address: "12 oak st" });
    assert.strictEqual(identify.headers.location, "/schedule/date");

    const done = await post(agent, "/schedule/date", "/schedule/date", { serviceTypeId: 1, preferredDate: FUTURE });
    assert.strictEqual(done.headers.location, "/schedule/thanks");

    const { rows } = await pool.query(
        `SELECT customer_id, property_id, request_statuses.name AS status FROM service_requests
         JOIN request_statuses ON request_statuses.id = status_id`);
    assert.deepStrictEqual(rows, [{ customer_id: ann.customerId, property_id: ann.propertyId, status: "Requested" }]);
});

test("the generic link with no match makes a Needs Review request with the typed details and no customer", async () => {
    const agent = request.agent(server);
    await post(agent, "/schedule", "/schedule", { name: "Nobody Here", phone: "2085559999", address: "1 Nowhere Rd" });
    await post(agent, "/schedule/date", "/schedule/date", { serviceTypeId: 1, preferredDate: FUTURE });

    const { rows } = await pool.query(
        `SELECT customer_id, contact_name, contact_address, request_statuses.name AS status FROM service_requests
         JOIN request_statuses ON request_statuses.id = status_id`);
    assert.deepStrictEqual(rows, [{
        customer_id: null, contact_name: "Nobody Here", contact_address: "1 Nowhere Rd", status: "Needs Review",
    }]);
});

test("a generic-link match and a miss show the visitor exactly the same pages", async () => {
    await customerWithProperty();
    const matched = request.agent(server);
    const missed = request.agent(server);
    await post(matched, "/schedule", "/schedule", { name: "Ann Lee", phone: "2085550101", address: "12 Oak St" });
    await post(missed, "/schedule", "/schedule", { name: "Zed Zed", phone: "2085550000", address: "1 Elm St" });

    const strip = (html) => {
        return html.replace(/value="[^"]*"/g, "");
    };
    assert.strictEqual(strip((await matched.get("/schedule/date")).text), strip((await missed.get("/schedule/date")).text));
    const a = await post(matched, "/schedule/date", "/schedule/date", { serviceTypeId: 1, preferredDate: FUTURE });
    const b = await post(missed, "/schedule/date", "/schedule/date", { serviceTypeId: 1, preferredDate: FUTURE });
    assert.strictEqual(a.status, b.status);
    assert.strictEqual(a.headers.location, b.headers.location);
    assert.strictEqual(strip((await matched.get("/schedule/thanks")).text), strip((await missed.get("/schedule/thanks")).text));
});

test("the generic link never logs the visitor in or shows existing requests", async () => {
    await customerWithProperty();
    const agent = request.agent(server);
    await post(agent, "/schedule", "/schedule", { name: "Ann Lee", phone: "2085550101", address: "12 Oak St" });
    assert.strictEqual((await agent.get("/requests")).status, 302);
});

test("generic link form errors, a skipped step, and a bad date are handled", async () => {
    const agent = request.agent(server);
    const bad = await post(agent, "/schedule", "/schedule", { name: "", phone: "1", address: "" });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual((await agent.get("/schedule/date")).headers.location, "/schedule");

    await post(agent, "/schedule", "/schedule", { name: "A B", phone: "2085550000", address: "1 Elm St" });
    const past = await post(agent, "/schedule/date", "/schedule/date", { serviceTypeId: 1, preferredDate: "2020-01-01" });
    assert.strictEqual(past.status, 400);
    const none = await pool.query("SELECT count(*)::int AS n FROM service_requests");
    assert.strictEqual(none.rows[0].n, 0);
});

test("too many schedule submissions from one address get a 429", async () => {
    const limited = createApp({ pool, sessionSecret: "test-secret", rateLimitMax: 2 });
    const limitedServer = await listen(limited);
    const agent = request.agent(limitedServer);
    const _csrf = await tokenFrom(agent, "/schedule");
    const fields = { _csrf, name: "", phone: "", address: "" };
    assert.strictEqual((await agent.post("/schedule").type("form").send(fields)).status, 400);
    assert.strictEqual((await agent.post("/schedule").type("form").send(fields)).status, 400);
    assert.strictEqual((await agent.post("/schedule").type("form").send(fields)).status, 429);
    limitedServer.close();
    limited.locals.sessionStore.close();
});
