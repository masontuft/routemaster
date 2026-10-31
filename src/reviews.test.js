import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as Review from "./models/review.js";
import * as ServiceRequest from "./models/serviceRequest.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("reviews");
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

function daysAhead(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function customerWithRequest(email, name, phone, status = "Completed") {
    const agent = request.agent(server);
    await loginAs(agent, email, "customer");
    const customerId = await Customer.ensureForUser(pool, await User.findByEmail(pool, email));
    await pool.query("UPDATE customers SET name = $2, phone = $3 WHERE id = $1", [customerId, name, phone]);
    const propertyId = await Property.create(pool, customerId, { street: "12 Oak Street", city: "Rexburg" });
    const id = await ServiceRequest.create(pool, {
        customerId, propertyId, serviceTypeId: 1, preferredDate: daysAhead(5),
    });
    await pool.query(
        "UPDATE service_requests SET status_id = (SELECT id FROM request_statuses WHERE name = $2) WHERE id = $1", [id, status]);
    return { agent, id, customerId };
}

test("short names hide the rest of a surname", () => {
    assert.strictEqual(Review.shortName("Ann Lee"), "Ann L.");
    assert.strictEqual(Review.shortName("  ann  marie  lee "), "ann L.");
    assert.strictEqual(Review.shortName("Cher"), "Cher");
    assert.strictEqual(Review.shortName(""), "Customer");
});

test("a customer reviews a completed request, edits it, and deletes it", async () => {
    const { agent, id } = await customerWithRequest("ann@example.com", "Ann Lee", "208-555-0101");
    const form = `/requests/${id}/review`;

    assert.match((await agent.get(`/requests/${id}`)).text, /Leave a Review/);
    const created = await post(agent, form, form, { rating: "5", body: "Great job" });
    assert.strictEqual(created.status, 302);
    assert.match((await agent.get(`/requests/${id}`)).text, /Great job/);

    await post(agent, form, form, { rating: "4", body: "Still great" });
    const { rows } = await pool.query("SELECT rating, body FROM reviews");
    assert.deepStrictEqual(rows, [{ rating: 4, body: "Still great" }]);

    const removed = await post(agent, `/requests/${id}`, `${form}/delete`, {});
    assert.strictEqual(removed.status, 302);
    assert.strictEqual((await pool.query("SELECT 1 FROM reviews")).rowCount, 0);
});

test("only a completed request can be reviewed, and ratings must be 1 to 5", async () => {
    const open = await customerWithRequest("ann@example.com", "Ann Lee", "208-555-0101", "Requested");
    assert.strictEqual((await open.agent.get(`/requests/${open.id}/review`)).status, 404);
    const early = await open.agent.get(`/requests/${open.id}`);
    assert.doesNotMatch(early.text, /Leave a Review/);
    const token = early.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const sneaky = await open.agent.post(`/requests/${open.id}/review`).type("form").send({ _csrf: token, rating: "5" });
    assert.strictEqual(sneaky.status, 404);

    await pool.query("UPDATE service_requests SET status_id = (SELECT id FROM request_statuses WHERE name = 'Completed')");
    const form = `/requests/${open.id}/review`;

    for (const rating of ["", "0", "6", "abc", "2.5"]) {
        const res = await post(open.agent, form, form, { rating, body: "x" });
        assert.strictEqual(res.status, 400, rating);
    }

    const long = await post(open.agent, form, form, { rating: "5", body: "x".repeat(1001) });
    assert.strictEqual(long.status, 400);
    assert.strictEqual((await pool.query("SELECT 1 FROM reviews")).rowCount, 0);
});

test("a customer cannot read, write or delete another customer's review", async () => {
    const ann = await customerWithRequest("ann@example.com", "Ann Lee", "208-555-0101");
    const bo = await customerWithRequest("bo@example.com", "Bo Kim", "208-555-0202");
    await Review.save(pool, { requestId: ann.id, customerId: ann.customerId, rating: 5, body: "Mine" });

    const form = `/requests/${ann.id}/review`;
    assert.strictEqual((await bo.agent.get(form)).status, 404);
    const token = await tokenFrom(bo.agent, `/requests/${bo.id}`);
    assert.strictEqual((await bo.agent.post(form).type("form").send({ _csrf: token, rating: "1" })).status, 404);
    assert.strictEqual((await bo.agent.post(`${form}/delete`).type("form").send({ _csrf: token })).status, 404);

    const { rows } = await pool.query("SELECT rating, body FROM reviews");
    assert.deepStrictEqual(rows, [{ rating: 5, body: "Mine" }]);
});

test("the public page shows abbreviated names, escapes text, and omits hidden reviews", async () => {
    const ann = await customerWithRequest("ann@example.com", "Ann Lee", "208-555-0101");
    const bo = await customerWithRequest("bo@example.com", "Bo Kim", "208-555-0202");
    await Review.save(pool, { requestId: ann.id, customerId: ann.customerId, rating: 5, body: "<script>alert(1)</script>" });
    await Review.save(pool, { requestId: bo.id, customerId: bo.customerId, rating: 3, body: "Rude words" });
    await pool.query("UPDATE reviews SET hidden = TRUE WHERE customer_id = $1", [bo.customerId]);

    const page = await request(server).get("/reviews");
    assert.strictEqual(page.status, 200);
    assert.match(page.text, /Ann L\./);
    assert.doesNotMatch(page.text, /Ann Lee/);
    assert.doesNotMatch(page.text, /<script>alert/);
    assert.match(page.text, /&lt;script&gt;/);
    assert.doesNotMatch(page.text, /Rude words/);
    assert.match(page.text, /Average rating: 5 of 5 from 1 review/);

    assert.match((await bo.agent.get(`/requests/${bo.id}`)).text, /hidden by staff/);
});

test("staff routes for reviews refuse visitors and customers", async () => {
    const ann = await customerWithRequest("ann@example.com", "Ann Lee", "208-555-0101");
    const reviewId = await Review.save(pool, { requestId: ann.id, customerId: ann.customerId, rating: 5, body: "Hi" });

    assert.strictEqual((await request(server).get("/staff/reviews")).status, 302);
    assert.strictEqual((await ann.agent.get("/staff/reviews")).status, 403);
    const token = await tokenFrom(ann.agent, "/requests");
    const forged = await ann.agent.post(`/staff/reviews/${reviewId}/hide`).type("form").send({ _csrf: token });
    assert.strictEqual(forged.status, 403);
});

test("a dispatcher hides and restores a review, but only an owner can delete one", async () => {
    const ann = await customerWithRequest("ann@example.com", "Ann Lee", "208-555-0101");
    const reviewId = await Review.save(pool, { requestId: ann.id, customerId: ann.customerId, rating: 5, body: "Hi" });
    const dispatcher = request.agent(server);
    await loginAs(dispatcher, "dee@example.com", "dispatcher");

    assert.match((await dispatcher.get("/staff/reviews")).text, /Ann Lee/);
    const hide = await post(dispatcher, "/staff/reviews", `/staff/reviews/${reviewId}/hide`, {});
    assert.strictEqual(hide.status, 302);
    assert.doesNotMatch((await request(server).get("/reviews")).text, /Ann L\./);

    await post(dispatcher, "/staff/reviews", `/staff/reviews/${reviewId}/restore`, {});
    assert.match((await request(server).get("/reviews")).text, /Ann L\./);

    const denied = await post(dispatcher, "/staff/reviews", `/staff/reviews/${reviewId}/delete`, {});
    assert.strictEqual(denied.status, 403);
    assert.strictEqual((await pool.query("SELECT 1 FROM reviews")).rowCount, 1);

    const owner = request.agent(server);
    await loginAs(owner, "boss@example.com", "owner");
    const deleted = await post(owner, "/staff/reviews", `/staff/reviews/${reviewId}/delete`, {});
    assert.strictEqual(deleted.status, 302);
    assert.strictEqual((await pool.query("SELECT 1 FROM reviews")).rowCount, 0);
    assert.strictEqual((await post(owner, "/staff/reviews", "/staff/reviews/99999/hide", {})).status, 404);
});
