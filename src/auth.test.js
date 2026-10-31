import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { getTestDatabaseUrl } from "./config/testDatabase.js";
import { createPool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import { hashPassword } from "./utils/password.js";

const migrations = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const url = getTestDatabaseUrl();
const schema = `auth_test_${process.pid}`;
let admin;
let pool;
let app;

before(async () => {
    admin = createPool(url);
    pool = createPool(url, { options: `-c search_path=${schema}` });
});

beforeEach(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runMigrations(pool, migrations);
    app?.locals.sessionStore.close();
    app = createApp({ pool, sessionSecret: "test-secret" });
});

after(async () => {
    app?.locals.sessionStore.close();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
    await admin.end();
});

async function tokenFrom(agent, pagePath) {
    const res = await agent.get(pagePath);
    return res.text.match(/name="_csrf" value="([^"]+)"/)[1];
}

async function register(agent, email = "ann@example.com", password = "longenough") {
    const _csrf = await tokenFrom(agent, "/register");
    return agent.post("/register").type("form").send({ _csrf, email, password, confirm: password });
}

test("registering creates a customer, logs them in, and stores the session in Postgres", async () => {
    const agent = request.agent(app);
    const res = await register(agent);
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.location, "/");

    const home = await agent.get("/");
    assert.match(home.text, /ann@example\.com/);

    const user = await User.findByEmail(pool, "ann@example.com");
    assert.strictEqual(user.role, "customer");
    assert.notStrictEqual(user.password_hash, "longenough");

    const sessions = await pool.query("SELECT count(*)::int AS n FROM session");
    assert.strictEqual(sessions.rows[0].n, 1);
});

test("registering the same email twice is rejected", async () => {
    await register(request.agent(app));
    const res = await register(request.agent(app));
    assert.strictEqual(res.status, 400);
    assert.match(res.text, /already registered/);
});

test("invalid registration input shows errors and creates nothing", async () => {
    const res = await register(request.agent(app), "nope", "short");
    assert.strictEqual(res.status, 400);
    assert.match(res.text, /valid email/);
    const count = await pool.query("SELECT count(*)::int AS n FROM users");
    assert.strictEqual(count.rows[0].n, 0);
});

test("a post without a CSRF token is rejected with 403", async () => {
    const res = await request(app).post("/register").type("form")
        .send({ email: "ann@example.com", password: "longenough", confirm: "longenough" });
    assert.strictEqual(res.status, 403);
    const count = await pool.query("SELECT count(*)::int AS n FROM users");
    assert.strictEqual(count.rows[0].n, 0);
});

test("logging in works, and wrong credentials give the same generic message", async () => {
    const passwordHash = await hashPassword("longenough");
    await User.create(pool, { email: "bob@example.com", passwordHash, roleName: "dispatcher" });

    const agent = request.agent(app);
    const _csrf = await tokenFrom(agent, "/login");
    const bad = await agent.post("/login").type("form")
        .send({ _csrf, email: "bob@example.com", password: "nope-nope" });
    const missing = await agent.post("/login").type("form")
        .send({ _csrf, email: "nobody@example.com", password: "nope-nope" });
    assert.strictEqual(bad.status, 401);
    assert.strictEqual(missing.status, 401);
    assert.match(bad.text, /Invalid email or password/);
    assert.match(missing.text, /Invalid email or password/);

    const ok = await agent.post("/login").type("form")
        .send({ _csrf, email: "BOB@example.com", password: "longenough" });
    assert.strictEqual(ok.status, 302);
    assert.match((await agent.get("/")).text, /bob@example\.com/);
});

test("logging out ends the session", async () => {
    const agent = request.agent(app);
    await register(agent);
    const _csrf = await tokenFrom(agent, "/");
    const out = await agent.post("/logout").type("form").send({ _csrf });
    assert.strictEqual(out.status, 302);
    assert.doesNotMatch((await agent.get("/")).text, /ann@example\.com/);
});

test("the session ID changes at login (no session fixation)", async () => {
    const agent = request.agent(app);
    await agent.get("/login");
    const before = (await pool.query("SELECT sid FROM session")).rows.map((row) => {
        return row.sid;
    });
    await register(agent);
    const after = (await pool.query("SELECT sid FROM session")).rows.map((row) => {
        return row.sid;
    });
    assert.ok(after.length > 0);
    assert.ok(after.every((sid) => {
        return !before.includes(sid);
    }));
});
