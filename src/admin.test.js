import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as ServiceRequest from "./models/serviceRequest.js";
import * as Admin from "./models/admin.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("admin");
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
    const user = await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName });
    await post(agent, "/login", "/login", { email, password: "longenough" });
    return user.id;
}

async function ownerAgent() {
    const agent = request.agent(server);
    const id = await loginAs(agent, "owner@example.com", "owner");
    return { agent, id };
}

async function roleOf(id) {
    const { rows } = await pool.query("SELECT roles.name FROM users JOIN roles ON roles.id = users.role_id WHERE users.id = $1", [id]);
    return rows[0].name;
}

const ADMIN_PATHS = ["/admin/users", "/admin/users/new", "/admin/service-types", "/admin/service-types/new", "/admin/service-types/1/edit"];

test("admin pages send a visitor to log in and refuse a dispatcher and a customer", async () => {
    for (const path of ADMIN_PATHS) {
        const visitor = await request(server).get(path);
        assert.strictEqual(visitor.status, 302, path);
        assert.strictEqual(visitor.headers.location, "/login");
    }

    for (const role of ["dispatcher", "customer"]) {
        const agent = request.agent(server);
        await loginAs(agent, `${role}@example.com`, role);

        for (const path of ADMIN_PATHS) {
            assert.strictEqual((await agent.get(path)).status, 403, `${role} ${path}`);
        }

        const token = await tokenFrom(agent, "/");
        const forged = await agent.post("/admin/users/1/role").type("form").send({ _csrf: token, role: "owner" });
        assert.strictEqual(forged.status, 403);
    }
});

test("an owner changes another user's role, but not their own", async () => {
    const { agent, id } = await ownerAgent();
    const other = await User.create(pool, { email: "dee@example.com", passwordHash: "x", roleName: "dispatcher" });

    const promoted = await post(agent, "/admin/users", `/admin/users/${other.id}/role`, { role: "owner" });
    assert.strictEqual(promoted.status, 302);
    assert.strictEqual(await roleOf(other.id), "owner");

    const self = await post(agent, "/admin/users", `/admin/users/${id}/role`, { role: "customer" });
    assert.strictEqual(self.status, 400);
    assert.match(self.text, /cannot change your own role/);
    assert.strictEqual(await roleOf(id), "owner");
});

test("an unknown role, an unknown user and a link-only customer are rejected", async () => {
    const { agent } = await ownerAgent();
    const other = await User.create(pool, { email: "dee@example.com", passwordHash: "x", roleName: "dispatcher" });
    const customerId = await Customer.create(pool, { name: "Ann Lee", phone: "208-555-0101" });
    const linkUser = await Customer.ensureUser(pool, customerId);

    const bogus = await post(agent, "/admin/users", `/admin/users/${other.id}/role`, { role: "emperor" });
    assert.strictEqual(bogus.status, 400);
    assert.strictEqual(await roleOf(other.id), "dispatcher");

    assert.strictEqual((await post(agent, "/admin/users", "/admin/users/99999/role", { role: "owner" })).status, 404);
    assert.strictEqual((await post(agent, "/admin/users", "/admin/users/abc/role", { role: "owner" })).status, 404);

    const link = await post(agent, "/admin/users", `/admin/users/${linkUser.id}/role`, { role: "dispatcher" });
    assert.strictEqual(link.status, 400);
    assert.match(link.text, /signs in by link/);
    assert.strictEqual(await roleOf(linkUser.id), "customer");
});

test("the last owner cannot be demoted", async () => {
    const only = await User.create(pool, { email: "solo@example.com", passwordHash: "x", roleName: "owner" });

    assert.deepStrictEqual(await Admin.changeRole(pool, only.id, "dispatcher", 0), { error: "last_owner" });
    assert.strictEqual(await roleOf(only.id), "owner");

    await User.create(pool, { email: "two@example.com", passwordHash: "x", roleName: "owner" });
    assert.deepStrictEqual(await Admin.changeRole(pool, only.id, "dispatcher", 0), { ok: true });
});

test("an owner creates a staff user with a hashed password, and bad input is rejected", async () => {
    const { agent } = await ownerAgent();
    const page = "/admin/users/new";
    const good = { email: "New@Example.com", role: "dispatcher", password: "longenough", confirm: "longenough" };

    const created = await post(agent, page, "/admin/users", good);
    assert.strictEqual(created.status, 302);
    const { rows } = await pool.query("SELECT email, password_hash FROM users WHERE email = 'new@example.com'");
    assert.strictEqual(rows.length, 1);
    assert.notStrictEqual(rows[0].password_hash, "longenough");
    assert.match(rows[0].password_hash, /^\$2[aby]\$12\$/);

    const cases = [
        [{ ...good, password: "short", confirm: "short" }, /at least 8/],
        [{ ...good, confirm: "different1" }, /do not match/],
        [{ ...good, role: "customer" }, /Choose a staff role/],
        [{ ...good, role: "" }, /Choose a staff role/],
        [good, /already registered/],
    ];

    for (const [fields, message] of cases) {
        const res = await post(agent, page, "/admin/users", fields);
        assert.strictEqual(res.status, 400);
        assert.match(res.text, message);
    }
});

test("an owner adds, edits and deactivates a service, and customers stop seeing it", async () => {
    const { agent } = await ownerAgent();
    const page = "/admin/service-types/new";

    const added = await post(agent, page, "/admin/service-types", { name: "Winterize", price: "45.50", active: "on" });
    assert.strictEqual(added.status, 302);
    const { rows } = await pool.query("SELECT id, price_cents, active FROM service_types WHERE name = 'Winterize'");
    assert.deepStrictEqual(rows[0].price_cents, 4550);
    const edit = `/admin/service-types/${rows[0].id}`;
    assert.match((await agent.get("/admin/service-types")).text, /\$45\.50/);

    const renamed = await post(agent, `${edit}/edit`, edit, { name: "Winterize Plus", price: "50", active: "on" });
    assert.strictEqual(renamed.status, 302);
    assert.match((await agent.get("/admin/service-types")).text, /Winterize Plus[\s\S]*\$50\.00/);

    await post(agent, `${edit}/edit`, edit, { name: "Winterize Plus", price: "50" });
    const after = await pool.query("SELECT active FROM service_types WHERE id = $1", [rows[0].id]);
    assert.strictEqual(after.rows[0].active, false);

    const customer = request.agent(server);
    await loginAs(customer, "ann@example.com", "customer");
    await post(customer, "/properties/new", "/properties", { street: "5 Elm St", city: "Rexburg" });
    const form = await customer.get("/requests/new");
    assert.doesNotMatch(form.text, /Winterize/);
    assert.match(form.text, /Sprinkler Blowout/);
});

test("service input is validated, and a duplicate name is refused", async () => {
    const { agent } = await ownerAgent();
    const page = "/admin/service-types/new";
    const cases = [
        [{ name: "", price: "10" }, /service name/],
        [{ name: "X".repeat(81), price: "10" }, /service name/],
        [{ name: "Ok", price: "-1" }, /Enter a price/],
        [{ name: "Ok", price: "abc" }, /Enter a price/],
        [{ name: "Sprinkler Blowout", price: "10" }, /already exists/],
    ];

    for (const [fields, message] of cases) {
        const res = await post(agent, page, "/admin/service-types", fields);
        assert.strictEqual(res.status, 400, JSON.stringify(fields));
        assert.match(res.text, message);
    }

    const count = await pool.query("SELECT count(*)::int AS n FROM service_types");
    assert.strictEqual(count.rows[0].n, 2);
    assert.strictEqual((await agent.get("/admin/service-types/99999/edit")).status, 404);
});

test("the dashboard shows owner numbers to an owner and hides them from a dispatcher", async () => {
    await pool.query("UPDATE service_types SET price_cents = 4500 WHERE id = 1");
    const customerId = await Customer.create(pool, { name: "Ann Lee", phone: "208-555-0101" });
    const propertyId = await Property.create(pool, customerId, { street: "12 Oak Street", city: "Rexburg" });
    const date = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    for (const status of ["Scheduled", "Scheduled", "Completed", "Requested"]) {
        const id = await ServiceRequest.create(pool, { customerId, propertyId, serviceTypeId: 1, preferredDate: date });
        await pool.query(
            "UPDATE service_requests SET status_id = (SELECT id FROM request_statuses WHERE name = $2) WHERE id = $1", [id, status]);
    }

    const { agent } = await ownerAgent();
    const owner = (await agent.get("/staff")).text;
    assert.match(owner, /Requests received: 4/);
    assert.match(owner, /Completed: 1/);
    assert.match(owner, /Value of scheduled jobs: \$90\.00/);

    const dispatcher = request.agent(server);
    await loginAs(dispatcher, "dee@example.com", "dispatcher");
    const shown = await dispatcher.get("/staff");
    assert.strictEqual(shown.status, 200);
    assert.doesNotMatch(shown.text, /This Month/);
});
