import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as Area from "./models/area.js";
import { todayString, validateAreaDays } from "./utils/validation.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("areas");
const pool = db.pool;
let app;
let server;
let customerId;
let propertyId;

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
    customerId = await Customer.create(pool, { name: "Ann Lee", phone: "(208) 555-0101" });
    propertyId = await Property.create(pool, customerId, { street: "12 Oak Street", city: "Rexburg", zip: "83440" });
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
    await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName });
    await send(agent, "/login", "/login", { email, password: "longenough" });
    return agent;
}




function inDays(count) {
    return new Date(Date.now() + count * 86400000).toISOString().slice(0, 10);
}

async function daysOf(areaId) {
    return Area.upcomingDays(pool, areaId, todayString());
}

async function newArea(name = "Oakwood") {
    return Area.create(pool, name);
}

test("creating areas: staff can, a duplicate name in any case is refused, a customer cannot", async () => {
    const dispatcher = await agentFor("dispatcher");

    const ok = await send(dispatcher, "/staff/areas", "/staff/areas", { name: "Oakwood" });
    assert.strictEqual(ok.status, 303);
    const duplicate = await send(dispatcher, "/staff/areas", "/staff/areas", { name: "  OAKWOOD " });
    assert.strictEqual(duplicate.status, 400);
    assert.match(duplicate.text, /already exists/);
    const blank = await send(dispatcher, "/staff/areas", "/staff/areas", { name: "   " });
    assert.strictEqual(blank.status, 400);
    assert.strictEqual((await Area.list(pool, todayString())).length, 1);

    const customer = await agentFor("customer");
    assert.strictEqual((await customer.get("/staff/areas")).status, 403);
});

test("a single day is added once, and a past or malformed day is refused", async () => {
    const id = await newArea();
    const dispatcher = await agentFor("dispatcher");
    const page = `/staff/areas/${id}`;
    const day = inDays(3);

    assert.strictEqual((await send(dispatcher, page, `${page}/days`, { day })).status, 303);
    assert.strictEqual((await send(dispatcher, page, `${page}/days`, { day })).status, 303);
    assert.deepStrictEqual(await daysOf(id), [day]);

    for (const bad of [inDays(-2), "2026-02-30", "tomorrow"]) {
        const res = await send(dispatcher, page, `${page}/days`, { day: bad });
        assert.strictEqual(res.status, 400, bad);
    }
    assert.deepStrictEqual(await daysOf(id), [day]);
});

test("a weekday between two dates adds exactly those weekdays", async () => {
    const id = await newArea();
    const owner = await agentFor("owner");
    const page = `/staff/areas/${id}`;
    const from = inDays(1);

    const res = await send(owner, page, `${page}/days`, { weekday: "2", from, to: inDays(28) });

    assert.strictEqual(res.status, 303);
    const days = await daysOf(id);
    assert.strictEqual(days.length, 4);
    assert.ok(days.every((day) => {
        return new Date(`${day}T00:00:00Z`).getUTCDay() === 2 && day >= from;
    }));
});

test("a range with the end before the start, or a bad weekday, adds nothing", async () => {
    const id = await newArea();
    const owner = await agentFor("owner");
    const page = `/staff/areas/${id}`;

    const backwards = await send(owner, page, `${page}/days`, { weekday: "2", from: inDays(10), to: inDays(2) });
    const badWeekday = await send(owner, page, `${page}/days`, { weekday: "9", from: inDays(1), to: inDays(9) });

    assert.deepStrictEqual([backwards.status, badWeekday.status], [400, 400]);
    assert.deepStrictEqual(await daysOf(id), []);
});

test("removing a day works once, and a day that is not there gives 404", async () => {
    const id = await newArea();
    const owner = await agentFor("owner");
    const page = `/staff/areas/${id}`;
    const day = inDays(5);
    await Area.addDays(pool, id, [day]);

    assert.strictEqual((await send(owner, page, `${page}/days/delete`, { day })).status, 303);
    assert.deepStrictEqual(await daysOf(id), []);
    assert.strictEqual((await send(owner, page, `${page}/days/delete`, { day })).status, 404);
    assert.strictEqual((await send(owner, page, `${page}/days/delete`, { day: "x'; DROP TABLE area_days" })).status, 404);
});

test("renaming works, and taking another area's name is refused", async () => {
    const id = await newArea("Oakwood");
    await newArea("Pine Hills");
    const owner = await agentFor("owner");
    const page = `/staff/areas/${id}`;

    assert.strictEqual((await send(owner, page, page, { name: "Oakwood East" })).status, 303);
    assert.strictEqual((await Area.find(pool, id)).name, "Oakwood East");
    const taken = await send(owner, page, page, { name: "pine hills" });
    assert.strictEqual(taken.status, 400);
    assert.strictEqual((await Area.find(pool, id)).name, "Oakwood East");
    assert.strictEqual((await owner.get("/staff/areas/9999")).status, 404);
});

test("staff assign a property to an area and clear it; an unknown or malformed area is refused", async () => {
    const id = await newArea();
    const dispatcher = await agentFor("dispatcher");
    const page = `/staff/properties/${propertyId}/edit`;
    const area = async () => {
        const { rows } = await pool.query("SELECT subdivision_id FROM properties WHERE id = $1", [propertyId]);
        return rows[0].subdivision_id;
    };

    const form = await dispatcher.get(page);
    assert.ok(form.text.includes('name="subdivisionId"'));
    assert.strictEqual((await send(dispatcher, page, page, { subdivisionId: String(id) })).status, 303);
    assert.strictEqual(await area(), id);

    for (const bad of ["9999", "abc"]) {
        assert.strictEqual((await send(dispatcher, page, page, { subdivisionId: bad })).status, 400, bad);
    }
    assert.strictEqual(await area(), id);

    assert.strictEqual((await send(dispatcher, page, page, { subdivisionId: "" })).status, 303);
    assert.strictEqual(await area(), null);
});

test("deleting an area removes its days", async () => {
    const id = await newArea();
    await Area.addDays(pool, id, [inDays(2)]);

    await pool.query("DELETE FROM subdivisions WHERE id = $1", [id]);

    const { rows } = await pool.query("SELECT count(*)::int AS n FROM area_days");
    assert.strictEqual(rows[0].n, 0);
});

test("day input is checked against a fixed today", () => {
    const today = "2026-11-02";

    assert.deepStrictEqual(validateAreaDays({ day: "2026-11-03" }, today), { days: ["2026-11-03"], errors: [] });
    assert.deepStrictEqual(
        validateAreaDays({ weekday: "2", from: "2026-11-03", to: "2026-11-24" }, today).days,
        ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"],
    );
    assert.strictEqual(validateAreaDays({ day: "2026-11-01" }, today).errors.length, 1);
    assert.strictEqual(validateAreaDays({}, today).errors.length > 0, true);
    assert.deepStrictEqual(validateAreaDays({ weekday: "1", from: "2026-11-03", to: "2026-11-05" }, today).days, []);
});
