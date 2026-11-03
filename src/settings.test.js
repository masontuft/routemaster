import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as AppSetting from "./models/appSetting.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("settings");
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

async function send(agent, pagePath, action, fields) {
    const _csrf = await tokenFrom(agent, pagePath);
    return agent.post(action).type("form").send({ _csrf, ...fields });
}

async function agentFor(roleName) {
    const agent = request.agent(server);
    const email = `${roleName}@example.com`;
    const user = await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName });
    await send(agent, "/login", "/login", { email, password: "longenough" });
    return { agent, id: user.id };
}

test("a fresh database has tentative booking off", async () => {
    assert.strictEqual(await AppSetting.get(pool, "allow_tentative_booking"), "off");
    assert.strictEqual(await AppSetting.allowsTentativeBooking(pool), false);
});

test("the model saves an allowed value, changes it again, and records who", async () => {
    const { id } = await agentFor("owner");

    assert.strictEqual(await AppSetting.set(pool, "allow_tentative_booking", "on", id), true);
    assert.strictEqual(await AppSetting.allowsTentativeBooking(pool), true);
    assert.strictEqual(await AppSetting.set(pool, "allow_tentative_booking", "off", id), true);
    assert.strictEqual(await AppSetting.allowsTentativeBooking(pool), false);
    const { rows } = await pool.query("SELECT updated_by FROM app_settings");
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].updated_by, id);
});

test("the model refuses a value the setting does not allow, and an unknown setting", async () => {
    assert.strictEqual(await AppSetting.set(pool, "allow_tentative_booking", "maybe", null), false);
    assert.strictEqual(await AppSetting.set(pool, "no_such_setting", "on", null), false);
    await assert.rejects(AppSetting.get(pool, "no_such_setting"), RangeError);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM app_settings");
    assert.strictEqual(rows[0].n, 0);
});

test("a saved value that is no longer allowed falls back to the default", async () => {
    await pool.query("INSERT INTO app_settings (key, value) VALUES ('allow_tentative_booking', 'sometimes')");

    assert.strictEqual(await AppSetting.get(pool, "allow_tentative_booking"), "off");
});

test("the owner turns the option on and off from the settings page", async () => {
    const { agent } = await agentFor("owner");

    const first = await agent.get("/admin/settings");
    assert.strictEqual(first.status, 200);
    assert.doesNotMatch(first.text, /checked/);

    const on = await send(agent, "/admin/settings", "/admin/settings", { allowTentative: "1" });
    assert.match(on.text, /Settings saved/);
    assert.match(on.text, /checked/);
    assert.strictEqual(await AppSetting.allowsTentativeBooking(pool), true);

    const off = await send(agent, "/admin/settings", "/admin/settings", {});
    assert.doesNotMatch(off.text, /checked/);
    assert.strictEqual(await AppSetting.allowsTentativeBooking(pool), false);
});

test("a dispatcher, a customer and a signed-out visitor cannot reach the settings", async () => {
    const dispatcher = await agentFor("dispatcher");
    const customer = await agentFor("customer");

    assert.strictEqual((await request(server).get("/admin/settings")).status, 302);
    assert.strictEqual((await dispatcher.agent.get("/admin/settings")).status, 403);
    assert.strictEqual((await customer.agent.get("/admin/settings")).status, 403);
    const post = await dispatcher.agent.post("/admin/settings").type("form").send({ allowTentative: "1" });
    assert.notStrictEqual(post.status, 200);
    assert.strictEqual(await AppSetting.allowsTentativeBooking(pool), false);
});

test("requests start out confirmed", async () => {
    const { rows } = await pool.query(
        "SELECT column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'service_requests' AND column_name = 'tentative'",
    );

    assert.strictEqual(rows[0].column_default, "false");
});
