import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as Area from "./models/area.js";
import { locateProperties } from "./geocoding/locate.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("areacity");
const pool = db.pool;
let app;
let server;
let areaId;
let customerId;

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
    areaId = await Area.create(pool, "Meridian 1");
    customerId = await Customer.create(pool, { name: "Ann Lee", phone: "208-555-0101" });
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

// A property in the area, with a city of its own only when one is given.
async function property(street, city = null, area = areaId) {
    const id = await Property.create(pool, customerId, { street, city });
    await pool.query("UPDATE properties SET subdivision_id = $2 WHERE id = $1", [id, area]);
    return id;
}

async function stateOf(id) {
    const { rows } = await pool.query("SELECT geocode_status, latitude FROM properties WHERE id = $1", [id]);
    return rows[0];
}

const found = async () => {
    return { status: "found", lat: 43.6, lng: -116.4, source: "google" };
};

test("an area has no city until one is set, and setting then clearing it works", async () => {
    assert.strictEqual((await Area.find(pool, areaId)).city, null);

    assert.strictEqual(await Area.setCity(pool, areaId, "Meridian"), true);
    assert.strictEqual((await Area.find(pool, areaId)).city, "Meridian");
    assert.strictEqual((await Area.list(pool, "2026-01-01"))[0].city, "Meridian");

    assert.strictEqual(await Area.setCity(pool, areaId, ""), true);
    assert.strictEqual((await Area.find(pool, areaId)).city, null);
    assert.strictEqual(await Area.setCity(pool, 99999, "Nowhere"), false);
});

test("a property with no city is looked up with its area's city, and its own city wins", async () => {
    await Area.setCity(pool, areaId, "Meridian");
    const bare = await property("1 Elm St");
    const own = await property("2 Elm St", "Eagle");
    const asked = [];

    await locateProperties(pool, [bare, own], {
        state: "ID", geocode: async (address) => {
            asked.push(address);
            return found();
        },
    });

    assert.deepStrictEqual(asked, ["1 Elm St, Meridian, ID", "2 Elm St, Eagle, ID"]);
});

test("without any city, the property is still too vague to look up", async () => {
    const bare = await property("1 Elm St");
    let calls = 0;

    await locateProperties(pool, [bare], { geocode: async () => {
        calls += 1;
        return found();
    } });

    assert.strictEqual(calls, 0);
    assert.strictEqual((await stateOf(bare)).geocode_status, "failed");
});

test("changing the area's city sends city-less properties back to be looked up, and leaves the rest", async () => {
    await Area.setCity(pool, areaId, "Meridian");
    const bare = await property("1 Elm St");
    const own = await property("2 Elm St", "Eagle");
    await locateProperties(pool, [bare, own], { geocode: found });

    await Area.setCity(pool, areaId, "Meridian");
    assert.strictEqual((await stateOf(bare)).geocode_status, "ok");

    await Area.setCity(pool, areaId, "Nampa");
    assert.deepStrictEqual(await stateOf(bare), { geocode_status: "pending", latitude: null });
    assert.strictEqual((await stateOf(own)).geocode_status, "ok");
});

test("a failed property becomes lookup-able when its area gets a city", async () => {
    const bare = await property("1 Elm St");
    await locateProperties(pool, [bare], { geocode: found });
    assert.strictEqual((await stateOf(bare)).geocode_status, "failed");

    await Area.setCity(pool, areaId, "Meridian");

    assert.strictEqual((await stateOf(bare)).geocode_status, "pending");
});

test("moving a property to another area clears its point, and saving the same area keeps it", async () => {
    const other = await Area.create(pool, "Eagle 1");
    await Area.setCity(pool, areaId, "Meridian");
    const bare = await property("1 Elm St");
    await locateProperties(pool, [bare], { geocode: found });

    await Property.update(pool, bare, { street: "1 Elm St", subdivisionId: areaId });
    assert.strictEqual((await stateOf(bare)).geocode_status, "ok");

    await Property.update(pool, bare, { subdivisionId: other });
    assert.strictEqual((await stateOf(bare)).geocode_status, "pending");
});

test("the areas page saves many cities at once, and a blank clears one", async () => {
    const second = await Area.create(pool, "Eagle 1");
    await Area.setCity(pool, second, "Eagle");
    const dispatcher = await agentFor("dispatcher");

    const page = await dispatcher.get("/staff/areas");
    assert.match(page.text, /aria-label="City for Meridian 1"/);
    assert.match(page.text, /value="Eagle"/);

    const res = await send(dispatcher, "/staff/areas", "/staff/areas/cities", {
        [`city_${areaId}`]: "  Meridian  ", [`city_${second}`]: "", city_99999: "Ghost", unrelated: "x",
    });

    assert.strictEqual(res.status, 303);
    assert.strictEqual((await Area.find(pool, areaId)).city, "Meridian");
    assert.strictEqual((await Area.find(pool, second)).city, null);
});

test("one bad city saves nothing", async () => {
    const second = await Area.create(pool, "Eagle 1");
    const dispatcher = await agentFor("dispatcher");

    const res = await send(dispatcher, "/staff/areas", "/staff/areas/cities", {
        [`city_${areaId}`]: "Meridian", [`city_${second}`]: "x".repeat(101),
    });

    assert.strictEqual(res.status, 400);
    assert.match(res.text, /city of up to 100 characters/);
    assert.strictEqual((await Area.find(pool, areaId)).city, null);
});

test("customers and signed-out visitors cannot set cities", async () => {
    const customer = await agentFor("customer");

    assert.strictEqual((await request(server).get("/staff/areas")).status, 302);
    const res = await customer.post("/staff/areas/cities").type("form").send({ [`city_${areaId}`]: "Meridian" });
    assert.notStrictEqual(res.status, 303);
    assert.strictEqual((await Area.find(pool, areaId)).city, null);
});
