import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as ContactMessage from "./models/contactMessage.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("contact");
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

const GOOD = { name: "Cy Doe", email: "Cy@Example.com", phone: "208-555-0303", message: "Do you service Ammon?" };

test("the contact form saves a message for a visitor", async () => {
    const visitor = request.agent(server);
    const sent = await post(visitor, "/contact", "/contact", GOOD);
    assert.strictEqual(sent.status, 200);
    assert.match(sent.text, /Message Sent/);

    const { rows } = await pool.query("SELECT name, email, phone, message, status FROM contact_messages");
    assert.deepStrictEqual(rows, [{
        name: "Cy Doe", email: "cy@example.com", phone: "208-555-0303", message: "Do you service Ammon?", status: "New",
    }]);
});

test("the contact form rejects bad input and a missing CSRF token", async () => {
    const visitor = request.agent(server);
    const cases = [
        [{ ...GOOD, name: "" }, /Enter your name/],
        [{ ...GOOD, email: "nope" }, /valid email/],
        [{ ...GOOD, message: "" }, /Enter a message/],
        [{ ...GOOD, message: "x".repeat(2001) }, /Enter a message/],
        [{ ...GOOD, phone: "1".repeat(31) }, /Phone number is too long/],
    ];

    for (const [fields, message] of cases) {
        const res = await post(visitor, "/contact", "/contact", fields);
        assert.strictEqual(res.status, 400);
        assert.match(res.text, message);
    }

    assert.strictEqual((await request(server).post("/contact").type("form").send(GOOD)).status, 403);
    assert.strictEqual((await pool.query("SELECT 1 FROM contact_messages")).rowCount, 0);
});

test("the contact form is rate limited", async () => {
    server.close();
    app.locals.sessionStore.close();
    app = createApp({ pool, sessionSecret: "test-secret", rateLimitMax: 2 });
    server = await listen(app);
    const visitor = request.agent(server);
    const statuses = [];

    for (let i = 0; i < 3; i++) {
        statuses.push((await post(visitor, "/contact", "/contact", GOOD)).status);
    }

    assert.deepStrictEqual(statuses, [200, 200, 429]);
});

test("staff read messages, see them escaped, and record a reply", async () => {
    await ContactMessage.create(pool, { ...GOOD, name: "<script>alert(1)</script>" });
    const dispatcher = request.agent(server);
    await loginAs(dispatcher, "dee@example.com", "dispatcher");

    assert.match((await dispatcher.get("/staff")).text, /Messages \(1 new\)/);
    const list = await dispatcher.get("/staff/messages");
    assert.doesNotMatch(list.text, /<script>alert/);
    assert.match(list.text, /&lt;script&gt;/);
    assert.match((await dispatcher.get("/staff/messages/1")).text, /Do you service Ammon/);

    const empty = await post(dispatcher, "/staff/messages/1", "/staff/messages/1/reply", { note: " " });
    assert.strictEqual(empty.status, 400);

    const replied = await post(dispatcher, "/staff/messages/1", "/staff/messages/1/reply", { note: "Called back" });
    assert.strictEqual(replied.status, 302);
    const shown = await dispatcher.get("/staff/messages/1");
    assert.match(shown.text, /Replied by dee@example.com/);
    assert.match(shown.text, /Called back/);
    assert.match((await dispatcher.get("/staff")).text, /Messages \(0 new\)/);
    assert.strictEqual((await dispatcher.get("/staff/messages/99999")).status, 404);
});

test("message pages refuse visitors and customers", async () => {
    await ContactMessage.create(pool, GOOD);
    assert.strictEqual((await request(server).get("/staff/messages")).status, 302);

    const customer = request.agent(server);
    await loginAs(customer, "ann@example.com", "customer");
    assert.strictEqual((await customer.get("/staff/messages")).status, 403);
    const token = await tokenFrom(customer, "/requests");
    const forged = await customer.post("/staff/messages/1/reply").type("form").send({ _csrf: token, note: "x" });
    assert.strictEqual(forged.status, 403);
});
