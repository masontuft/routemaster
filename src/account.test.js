import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as AccessLink from "./models/accessLink.js";
import { hashPassword, verifyPassword } from "./utils/password.js";

// Changing your own password: /account/password.

const db = testDb("account");
const pool = db.pool;
let app;
let server;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    server?.close();
    app?.locals.sessionStore.close();
    app = createApp({ pool, sessionSecret: "test-secret" });
    server = await new Promise((resolve) => {
        const started = app.listen(0, () => {
            resolve(started);
        });
    });
    await pool.query("INSERT INTO companies (name, slug) VALUES ('Second Co', 'second-co')");
    await user("ann@example.com", 1);
    await user("bob@example.com", 1);
    await user("cy@second.example", 2);
});
after(async () => {
    server?.close();
    app?.locals.sessionStore.close();
    await db.close();
});

async function user(email, companyId) {
    return User.create(pool, { companyId, email, passwordHash: await hashPassword("old-password"), roleName: "owner" });
}

async function tokenFrom(agent, pagePath) {
    const res = await agent.get(pagePath);
    const found = res.text.match(/name="_csrf" value="([^"]+)"/);

    if (!found) {
        throw new Error(`No CSRF token on GET ${pagePath}: status ${res.status}`);
    }

    return found[1];
}

async function send(agent, pagePath, action, fields) {
    const _csrf = await tokenFrom(agent, pagePath);
    return agent.post(action).type("form").send({ _csrf, ...fields });
}

async function loggedIn(email, password = "old-password") {
    const agent = request.agent(server);
    const res = await send(agent, "/login", "/login", { email, password });
    assert.strictEqual(res.status, 302, `${email} could not log in`);
    return agent;
}

function change(agent, fields) {
    return send(agent, "/account/password", "/account/password", fields);
}

async function canLogIn(email, password) {
    const res = await send(request.agent(server), "/login", "/login", { email, password });
    return res.status === 302;
}

const GOOD = { current: "old-password", password: "new-password", confirm: "new-password" };

test("a logged-in user changes their password: the old one stops working and the new one works", async () => {
    const agent = await loggedIn("ann@example.com");

    const page = await agent.get("/account/password");
    const res = await change(agent, GOOD);

    assert.strictEqual(page.status, 200);
    assert.match(page.text, /Current Password/);
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /Your password was changed/);
    assert.strictEqual(await canLogIn("ann@example.com", "old-password"), false);
    assert.strictEqual(await canLogIn("ann@example.com", "new-password"), true);
});

test("a wrong current password, a mismatch, a short or long password and an unchanged password are refused, and nothing changes", async () => {
    const agent = await loggedIn("ann@example.com");
    const cases = [
        [{ ...GOOD, current: "wrong-password" }, /current password is not right/],
        [{ ...GOOD, confirm: "different" }, /do not match/],
        [{ ...GOOD, password: "short", confirm: "short" }, /at least 8/],
        [{ ...GOOD, password: "é".repeat(37), confirm: "é".repeat(37) }, /at most 72 bytes/],
        [{ current: "old-password", password: "old-password", confirm: "old-password" }, /different from the current/],
        [{ ...GOOD, current: "" }, /Enter your current password/],
    ];

    for (const [fields, message] of cases) {
        const res = await change(agent, fields);

        assert.strictEqual(res.status, 400, JSON.stringify(fields).slice(0, 40));
        assert.match(res.text, message);
    }

    assert.strictEqual(await canLogIn("ann@example.com", "old-password"), true);
    assert.strictEqual(await canLogIn("ann@example.com", "new-password"), false);
});

test("changing the password ends the user's other sessions and keeps the one that changed it", async () => {
    const phone = await loggedIn("ann@example.com");
    const laptop = await loggedIn("ann@example.com");

    await change(phone, GOOD);

    assert.strictEqual((await phone.get("/staff")).status, 200, "the session that changed it stays logged in");
    const other = await laptop.get("/staff");
    assert.strictEqual(other.status, 302, "the other session is ended");
    assert.strictEqual(other.headers.location, "/login");
});

test("another user's sessions are left alone, in the same company and in another", async () => {
    const ann = await loggedIn("ann@example.com");
    const bob = await loggedIn("bob@example.com");
    const cy = await loggedIn("cy@second.example");

    await change(ann, GOOD);

    assert.strictEqual((await bob.get("/staff")).status, 200);
    assert.strictEqual((await cy.get("/staff")).status, 200);
    assert.strictEqual(await canLogIn("bob@example.com", "old-password"), true);
});

test("a visitor who is not logged in is sent to log in, and nothing is changed by a post", async () => {
    const visitor = request.agent(server);
    const page = await visitor.get("/account/password");
    const _csrf = await tokenFrom(visitor, "/login");
    const post = await visitor.post("/account/password").type("form").send({ _csrf, ...GOOD });

    assert.strictEqual(page.headers.location, "/login");
    assert.strictEqual(post.headers.location, "/login");
    assert.strictEqual(await canLogIn("ann@example.com", "old-password"), true);
});

test("a customer who signs in by link has no password, so the page does not exist for them", async () => {
    const customerId = await Customer.create(pool, 1, { name: "Ann Lee", phone: "(208) 555-0101" });
    const token = await AccessLink.create(pool, { customerId });
    const agent = request.agent(server);
    await send(agent, `/l/${token}`, `/l/${token}`, {});

    const page = await agent.get("/account/password");
    const menu = await agent.get("/requests");

    assert.strictEqual(page.status, 404);
    assert.doesNotMatch(menu.text, /Change Password/);
});

test("a user with a password sees the link in the account menu", async () => {
    const agent = await loggedIn("ann@example.com");

    assert.match((await agent.get("/staff")).text, /href="\/account\/password"/);
});

test("a post without the CSRF token is refused, and trying the current password over and over is limited", async () => {
    const agent = await loggedIn("ann@example.com");

    const forged = await agent.post("/account/password").type("form").send(GOOD);
    assert.strictEqual(forged.status, 403);

    const statuses = [];
    for (let attempt = 0; attempt < 25; attempt += 1) {
        statuses.push((await change(agent, { ...GOOD, current: `guess-${attempt}` })).status);
    }

    assert.ok(statuses.includes(429), `no attempt was limited: ${statuses.join(",")}`);
    // The limit also stops logins from this address, so the password is checked in the database instead.
    const { rows } = await pool.query("SELECT password_hash FROM users WHERE email = 'ann@example.com'");
    assert.ok(await verifyPassword("old-password", rows[0].password_hash));
});
