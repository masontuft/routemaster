import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as ServiceType from "./models/serviceType.js";

const db = testDb("marketing");
const pool = db.pool;
let app;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    app?.locals.sessionStore.close();
    app = createApp({ pool, sessionSecret: "test-secret" });
});
after(async () => {
    app?.locals.sessionStore.close();
    await db.close();
});

test("the services page lists active services and prices only when set", async () => {
    await pool.query("DELETE FROM service_types");
    await ServiceType.create(pool, { name: "Spring Startup", priceCents: 7500, active: true });
    await ServiceType.create(pool, { name: "Winterization", priceCents: 0, active: true });
    await ServiceType.create(pool, { name: "Retired Service", priceCents: 1000, active: false });

    const res = await request(app).get("/services");
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /Spring Startup/);
    assert.match(res.text, /\$75\.00/);
    assert.match(res.text, /Winterization/);
    assert.match(res.text, /Contact us for pricing/);
    assert.doesNotMatch(res.text, /Retired Service/);
});

test("marketing pages use the marketing body class and the app pages do not", async () => {
    for (const path of ["/", "/services", "/contact"]) {
        assert.match((await request(app).get(path)).text, /<body class="marketing">/, path);
    }

    assert.match((await request(app).get("/login")).text, /<body class="app">/);
});

test("the 404 page uses the loud style and links home, while 403 stays conservative", async () => {
    const missing = await request(app).get("/no-such-page");
    assert.strictEqual(missing.status, 404);
    assert.match(missing.text, /<body class="loud">/);
    assert.match(missing.text, /href="\/"/);

    const denied = await request(app).get("/staff/messages");
    assert.notStrictEqual(denied.status, 404);
    assert.doesNotMatch(denied.text, /class="shout"/);
});
