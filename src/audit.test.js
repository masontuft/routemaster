import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as AuditLog from "./models/auditLog.js";
import { hashPassword } from "./utils/password.js";

// The audit log (migration 034): sensitive changes to logins are recorded in the same transaction as the change.

const db = testDb("audit");
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

async function loggedIn(email) {
    const agent = request.agent(server);
    await send(agent, "/login", "/login", { email, password: "old-password" });
    return agent;
}

async function rows() {
    return (await pool.query(
        "SELECT company_id, actor_id, action, target_id, details FROM audit_log ORDER BY id",
    )).rows;
}

test("an owner changing a staff email is recorded with who, whom, and the old and new address", async () => {
    const owner = await loggedIn("ann@example.com");

    await send(owner, "/admin/users", `/admin/users/${ids.dee}/email`, { email: "Dee.New@Example.com" });

    assert.deepStrictEqual(await rows(), [{
        company_id: 1, actor_id: ids.ann, action: "email_changed", target_id: ids.dee,
        details: { from: "dee@example.com", to: "dee.new@example.com" },
    }]);
});

test("a user changing their own email is recorded, and a refused change is not", async () => {
    const agent = await loggedIn("dee@example.com");

    await send(agent, "/account/email", "/account/email", { current: "wrong", email: "x@example.com", confirm: "x@example.com" });
    await send(agent, "/account/email", "/account/email", { current: "old-password", email: "ann@example.com", confirm: "ann@example.com" });
    assert.deepStrictEqual(await rows(), [], "a wrong password and a used address leave no record");

    await send(agent, "/account/email", "/account/email", { current: "old-password", email: "d2@example.com", confirm: "d2@example.com" });

    assert.deepStrictEqual(await rows(), [{
        company_id: 1, actor_id: ids.dee, action: "email_changed", target_id: ids.dee,
        details: { from: "dee@example.com", to: "d2@example.com" },
    }]);
});

test("a password change is recorded, and neither the password nor its hash is stored", async () => {
    const agent = await loggedIn("dee@example.com");

    await send(agent, "/account/password", "/account/password", {
        current: "old-password", password: "brand-new-password", confirm: "brand-new-password",
    });

    assert.deepStrictEqual(await rows(), [{
        company_id: 1, actor_id: ids.dee, action: "password_changed", target_id: ids.dee, details: {},
    }]);
    const everything = JSON.stringify((await pool.query("SELECT * FROM audit_log")).rows);
    assert.doesNotMatch(everything, /brand-new-password|old-password|\$2[aby]\$/);
});

test("a role change and a new staff user are recorded", async () => {
    const owner = await loggedIn("ann@example.com");

    await send(owner, "/admin/users", `/admin/users/${ids.dee}/role`, { role: "owner" });
    const made = await send(owner, "/admin/users/new", "/admin/users", {
        email: "eve@example.com", password: "longenough", confirm: "longenough", role: "dispatcher",
    });
    await send(owner, "/admin/users/new", "/admin/users", {
        email: "eve@example.com", password: "longenough", confirm: "longenough", role: "dispatcher",
    });

    const eve = (await pool.query("SELECT id FROM users WHERE email = 'eve@example.com'")).rows[0].id;
    assert.strictEqual(made.status, 302);
    assert.deepStrictEqual(await rows(), [
        { company_id: 1, actor_id: ids.ann, action: "role_changed", target_id: ids.dee, details: { from: "dispatcher", to: "owner" } },
        { company_id: 1, actor_id: ids.ann, action: "user_created", target_id: eve, details: { email: "eve@example.com", role: "dispatcher" } },
    ]);
});

test("a failed change leaves no record, and a failed record leaves no change", async () => {
    const owner = await loggedIn("ann@example.com");

    await send(owner, "/admin/users", `/admin/users/${ids.ann}/role`, { role: "dispatcher" });
    await send(owner, "/admin/users", `/admin/users/${ids.cy}/email`, { email: "x@example.com" });
    assert.deepStrictEqual(await rows(), []);

    // The row cannot be written for a company that does not exist, so the email change is rolled back with it.
    await assert.rejects(
        (async () => {
            const { withTransaction } = await import("./db/transaction.js");
            return withTransaction(pool, async (client) => {
                await User.setEmail(client, ids.dee, "rolled-back@example.com");
                await AuditLog.record(client, { companyId: 999, actorId: ids.ann, action: "email_changed", targetId: ids.dee });
            });
        })(),
        /foreign key/,
    );
    assert.strictEqual((await pool.query("SELECT email FROM users WHERE id = $1", [ids.dee])).rows[0].email, "dee@example.com");
    assert.strictEqual(AuditLog.describe("unknown", {}), "unknown");
    await assert.rejects(AuditLog.record(pool, { companyId: 1, actorId: ids.ann, action: "unknown" }), /Unknown audit action/);
});

test("the log page shows the owner's own company's entries and says who did what", async () => {
    const owner1 = await loggedIn("ann@example.com");
    const owner2 = await loggedIn("cy@second.example");
    await send(owner1, "/admin/users", `/admin/users/${ids.dee}/email`, { email: "dee.new@example.com" });
    await send(owner2, "/account/password", "/account/password", {
        current: "old-password", password: "brand-new-password", confirm: "brand-new-password",
    });

    const first = await owner1.get("/admin/audit");
    const second = await owner2.get("/admin/audit");

    assert.strictEqual(first.status, 200);
    assert.match(first.text, /changed an email from dee@example\.com to dee\.new@example\.com/);
    assert.match(first.text, /ann@example\.com/);
    assert.doesNotMatch(first.text, /cy@second\.example/);
    assert.match(second.text, /changed a password/);
    assert.doesNotMatch(second.text, /dee@example\.com/);
    assert.match(first.text, /href="\/admin\/audit"/);
    assert.deepStrictEqual((await AuditLog.list(pool, 2)).map((entry) => {
        return entry.action;
    }), ["password_changed"]);
});

test("a dispatcher and a visitor cannot read the log", async () => {
    const dispatcher = await loggedIn("dee@example.com");

    assert.strictEqual((await dispatcher.get("/admin/audit")).status, 403);
    assert.strictEqual((await request.agent(server).get("/admin/audit")).headers.location, "/login");
});

test("an entry outlives a deleted user and says so", async () => {
    const owner = await loggedIn("ann@example.com");
    await send(owner, "/admin/users", `/admin/users/${ids.dee}/email`, { email: "dee.new@example.com" });
    await pool.query("DELETE FROM users WHERE id = $1", [ids.dee]);

    const page = await owner.get("/admin/audit");

    assert.match(page.text, /\(deleted user\)/);
    assert.match(page.text, /dee@example\.com to dee\.new@example\.com/);
});
