import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import { hashPassword, verifyPassword } from "./utils/password.js";

// Changing a login email: your own at /account/email, and an owner changing a user of their company at /admin/users.

const db = testDb("email");
const pool = db.pool;
let app;
let server;
const ids = {};

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
    ids.ann = (await user("ann@example.com", 1, "owner")).id;
    ids.dee = (await user("dee@example.com", 1, "dispatcher")).id;
    ids.cy = (await user("cy@second.example", 2, "owner")).id;
});
after(async () => {
    server?.close();
    app?.locals.sessionStore.close();
    await db.close();
});

async function user(email, companyId, roleName) {
    return User.create(pool, { companyId, email, passwordHash: await hashPassword("old-password"), roleName });
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

async function canLogIn(email, password = "old-password") {
    return (await send(request.agent(server), "/login", "/login", { email, password })).status === 302;
}

async function emailOf(id) {
    return (await pool.query("SELECT email FROM users WHERE id = $1", [id])).rows[0].email;
}

const MINE = { current: "old-password", email: "new@example.com", confirm: "new@example.com" };

function changeMine(agent, fields) {
    return send(agent, "/account/email", "/account/email", fields);
}

function changeTheirs(agent, id, email) {
    return send(agent, "/admin/users", `/admin/users/${id}/email`, { email });
}

test("a user changes their own email: the old address stops working, the new one works with the same password, and the header shows it", async () => {
    const agent = await loggedIn("ann@example.com");

    const page = await agent.get("/account/email");
    const res = await changeMine(agent, { ...MINE, email: " New@Example.com ", confirm: "new@example.com" });
    const header = await agent.get("/staff");

    assert.match(page.text, /ann@example\.com/);
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /Your email was changed/);
    assert.strictEqual(await emailOf(ids.ann), "new@example.com");
    assert.match(header.text, /new@example\.com/);
    assert.strictEqual(await canLogIn("ann@example.com"), false);
    assert.strictEqual(await canLogIn("new@example.com"), true);
});

test("a wrong password, an unmatched or bad email and an email that is already a login are refused, and nothing changes", async () => {
    const agent = await loggedIn("ann@example.com");
    const cases = [
        [{ ...MINE, current: "wrong-password" }, /current password is not right/],
        [{ ...MINE, confirm: "other@example.com" }, /do not match/],
        [{ ...MINE, email: "not an email", confirm: "not an email" }, /valid email/],
        [{ ...MINE, email: "dee@example.com", confirm: "dee@example.com" }, /already has a login/],
        [{ ...MINE, email: "CY@second.example", confirm: "cy@second.example" }, /already has a login/],
    ];

    for (const [fields, message] of cases) {
        const res = await changeMine(agent, fields);

        assert.strictEqual(res.status, 400, JSON.stringify(fields).slice(0, 50));
        assert.match(res.text, message);
    }

    assert.strictEqual(await emailOf(ids.ann), "ann@example.com");
    assert.strictEqual(await emailOf(ids.dee), "dee@example.com");
});

test("a visitor, a link-only customer and a forged post cannot change an email", async () => {
    const visitor = request.agent(server);
    const customer = await Customer.create(pool, 1, { name: "Ann Lee", phone: "(208) 555-0101" });
    const linkUser = await Customer.ensureUser(pool, customer);
    const agent = await loggedIn("ann@example.com");

    assert.strictEqual((await visitor.get("/account/email")).headers.location, "/login");
    assert.strictEqual((await agent.post("/account/email").type("form").send(MINE)).status, 403);
    assert.strictEqual(linkUser.companyId, 1);
    assert.strictEqual(await emailOf(ids.ann), "ann@example.com");
});

test("an owner changes the email of a user in their company, who keeps their password", async () => {
    const owner = await loggedIn("ann@example.com");

    const res = await changeTheirs(owner, ids.dee, "Dee.New@Example.com");

    assert.strictEqual(res.headers.location, "/admin/users");
    assert.strictEqual(await emailOf(ids.dee), "dee.new@example.com");
    assert.strictEqual(await canLogIn("dee.new@example.com"), true);
    assert.strictEqual(await canLogIn("dee@example.com"), false);
    assert.match((await owner.get("/admin/users")).text, /dee\.new@example\.com/);
});

test("an owner cannot change a user of another company: 404, and nothing changes", async () => {
    const owner = await loggedIn("ann@example.com");

    const res = await changeTheirs(owner, ids.cy, "taken-over@example.com");

    assert.strictEqual(res.status, 404);
    assert.strictEqual(await emailOf(ids.cy), "cy@second.example");
    assert.deepStrictEqual(await (await import("./models/admin.js")).changeEmail(pool, 1, ids.cy, "x@example.com", ids.ann), {
        error: "not_found",
    });
});

test("an owner cannot change their own email there, a link-only customer's, or to an address that is already a login", async () => {
    const owner = await loggedIn("ann@example.com");
    const customer = await Customer.create(pool, 1, { name: "Ann Lee", phone: "(208) 555-0101" });
    const linkUser = await Customer.ensureUser(pool, customer);

    const self = await changeTheirs(owner, ids.ann, "me@example.com");
    const link = await changeTheirs(owner, linkUser.id, "link@example.com");
    const taken = await changeTheirs(owner, ids.dee, "cy@second.example");
    const bad = await changeTheirs(owner, ids.dee, "not an email");

    assert.deepStrictEqual([self.status, link.status, taken.status, bad.status], [400, 400, 400, 400]);
    assert.match(self.text, /account page/);
    assert.match(link.text, /signs in by link/);
    assert.match(taken.text, /already has a login/);
    assert.match(bad.text, /valid email/);
    assert.strictEqual(await emailOf(ids.ann), "ann@example.com");
    assert.strictEqual(await emailOf(ids.dee), "dee@example.com");
    assert.strictEqual((await pool.query("SELECT email FROM users WHERE id = $1", [linkUser.id])).rows[0].email, null);
});

test("a dispatcher cannot use the owner's page, and a visitor is sent to log in", async () => {
    const dispatcher = await loggedIn("dee@example.com");

    const res = await dispatcher.post("/admin/users/1/email").type("form").send({ email: "x@example.com" });

    assert.ok([302, 403].includes(res.status));
    assert.strictEqual(await emailOf(ids.ann), "ann@example.com");
    assert.strictEqual((await dispatcher.get("/admin/users")).status, 403);
});

test("changing an email does not change the password", async () => {
    const agent = await loggedIn("ann@example.com");

    await changeMine(agent, MINE);
    const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [ids.ann]);

    assert.ok(await verifyPassword("old-password", rows[0].password_hash));
});
