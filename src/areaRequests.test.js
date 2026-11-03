import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Property from "./models/property.js";
import * as Area from "./models/area.js";
import * as ServiceRequest from "./models/serviceRequest.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("areareq");
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
    // Fetch the token first: an agent attaches its cookies when the request is created.
    const _csrf = await tokenFrom(agent, pagePath);
    return agent.post(action).type("form").send({ _csrf, ...fields });
}

async function loginAs(agent, email) {
    await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName: "customer" });
    return post(agent, "/login", "/login", { email, password: "longenough" });
}

function inDays(count) {
    return new Date(Date.now() + count * 86400000).toISOString().slice(0, 10);
}

// The customer behind the login, one property per street, each in the area given (or none).
async function setup(streets) {
    const agent = request.agent(server);
    await loginAs(agent, "ann@example.com");
    await agent.get("/requests");
    const { rows } = await pool.query("SELECT id FROM customers");
    const ids = [];

    for (const street of streets) {
        ids.push(await Property.create(pool, rows[0].id, { street, city: "Rexburg" }));
    }

    return { agent, ids, customerId: rows[0].id };
}

async function areaWithDays(name, days, propertyIds = []) {
    const areaId = await Area.create(pool, name);
    await Area.addDays(pool, areaId, days);

    for (const id of propertyIds) {
        await pool.query("UPDATE properties SET subdivision_id = $2 WHERE id = $1", [id, areaId]);
    }

    return areaId;
}

async function requestCount() {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM service_requests");
    return rows[0].n;
}

const submit = (agent, fields) => {
    return post(agent, "/requests/new", "/requests", { serviceTypeId: 1, ...fields });
};

test("the form offers only the property's area days, and no free date field", async () => {
    const { agent, ids } = await setup(["12 Oak Street"]);
    await areaWithDays("Oakwood", [inDays(3), inDays(10), inDays(-4)], ids);
    await areaWithDays("Pine Hills", [inDays(5)]);

    const page = await agent.get("/requests/new");

    assert.ok(page.text.includes(`value="${inDays(3)}"`));
    assert.ok(page.text.includes(`value="${inDays(10)}"`));
    assert.ok(!page.text.includes(`value="${inDays(-4)}"`));
    assert.ok(!page.text.includes(`value="${inDays(5)}"`));
    assert.ok(!page.text.includes('type="date"'));
});

test("a date in the area's days is accepted, and one outside them is refused with nothing saved", async () => {
    const { agent, ids } = await setup(["12 Oak Street"]);
    await areaWithDays("Oakwood", [inDays(3)], ids);

    const outside = await submit(agent, { propertyId: ids[0], preferredDate: inDays(4) });
    assert.strictEqual(outside.status, 400);
    assert.match(outside.text, /Choose one of the available days/);
    assert.strictEqual(await requestCount(), 0);

    const inside = await submit(agent, { propertyId: ids[0], preferredDate: inDays(3) });
    assert.strictEqual(inside.status, 302);
    assert.strictEqual(await requestCount(), 1);
});

test("a property with no area, or an area with no upcoming days, can still request but is told the date is not confirmed", async () => {
    const { agent, ids } = await setup(["12 Oak Street", "9 Pine Street"]);
    await areaWithDays("Stale", [inDays(-2)], [ids[1]]);

    for (const [index, query] of [[0, ""], [1, "?propertyId=" + ids[1]]]) {
        const page = await agent.get("/requests/new" + query);
        assert.match(page.text, /not a confirmed time/, `property ${index}`);
        assert.ok(page.text.includes('type="date"'));

        const res = await submit(agent, { propertyId: ids[index], preferredDate: inDays(3) });
        assert.strictEqual(res.status, 302, `property ${index}`);
    }

    assert.strictEqual(await requestCount(), 2);
    assert.strictEqual((await submit(agent, { propertyId: ids[0], preferredDate: "2020-01-01" })).status, 400);
});

test("each property uses its own area: the page switches with propertyId, and a day from the other area is refused", async () => {
    const { agent, ids } = await setup(["12 Oak Street", "9 Pine Street"]);
    await areaWithDays("Oakwood", [inDays(3)], [ids[0]]);
    await areaWithDays("Pine Hills", [inDays(6)], [ids[1]]);

    const first = await agent.get("/requests/new");
    assert.ok(first.text.includes(`value="${inDays(3)}"`) && !first.text.includes(`value="${inDays(6)}"`));
    const second = await agent.get(`/requests/new?propertyId=${ids[1]}`);
    assert.ok(second.text.includes(`value="${inDays(6)}"`) && !second.text.includes(`value="${inDays(3)}"`));

    const crossed = await submit(agent, { propertyId: ids[1], preferredDate: inDays(3) });
    assert.strictEqual(crossed.status, 400);
    assert.strictEqual((await submit(agent, { propertyId: ids[1], preferredDate: inDays(6) })).status, 302);
});

test("a malformed or past date keeps its own message, and a forged property id is refused", async () => {
    const { agent, ids } = await setup(["12 Oak Street"]);
    await areaWithDays("Oakwood", [inDays(3)], ids);

    assert.match((await submit(agent, { propertyId: ids[0], preferredDate: "2020-01-01" })).text, /today or later/);
    assert.match((await submit(agent, { propertyId: ids[0], preferredDate: "soon" })).text, /valid date/);
    const forged = await submit(agent, { propertyId: 9999, preferredDate: inDays(3) });
    assert.strictEqual(forged.status, 400);
    assert.match(forged.text, /Choose one of your properties/);
    assert.strictEqual(await requestCount(), 0);
});

test("changing a request: a day in the area works, another day is refused, and an unchanged day still allows a notes edit", async () => {
    const { agent, ids, customerId } = await setup(["12 Oak Street"]);
    const areaId = await areaWithDays("Oakwood", [inDays(3), inDays(10)], ids);
    const id = await ServiceRequest.create(pool, {
        customerId, propertyId: ids[0], serviceTypeId: 1, preferredDate: inDays(3),
    });
    const page = `/requests/${id}/edit`;
    const savedDate = async () => {
        const { rows } = await pool.query("SELECT to_char(preferred_date, 'YYYY-MM-DD') AS d FROM service_requests");
        return rows[0].d;
    };

    const refused = await post(agent, page, page, { preferredDate: inDays(4), notes: "" });
    assert.strictEqual(refused.status, 400);
    assert.match(refused.text, /Choose one of the available days/);
    assert.strictEqual(await savedDate(), inDays(3));

    assert.strictEqual((await post(agent, page, page, { preferredDate: inDays(10), notes: "" })).status, 302);
    assert.strictEqual(await savedDate(), inDays(10));

    await Area.removeDay(pool, areaId, inDays(10));
    const form = await agent.get(page);
    assert.ok(form.text.includes(`value="${inDays(10)}"`));
    assert.strictEqual((await post(agent, page, page, { preferredDate: inDays(10), notes: "bring a key" })).status, 302);
});

test("with no days set, changing a request takes any valid date and says it is only a preference", async () => {
    const { agent, ids, customerId } = await setup(["12 Oak Street"]);
    const id = await ServiceRequest.create(pool, {
        customerId, propertyId: ids[0], serviceTypeId: 1, preferredDate: inDays(3),
    });
    const page = `/requests/${id}/edit`;

    assert.match((await agent.get(page)).text, /only a preference/);
    assert.strictEqual((await post(agent, page, page, { preferredDate: inDays(20), notes: "" })).status, 302);
    assert.strictEqual((await post(agent, page, page, { preferredDate: "soon", notes: "" })).status, 400);
});

test("the public schedule page still takes any date, because it must not reveal who is a customer", async () => {
    const agent = request.agent(server);

    await post(agent, "/schedule", "/schedule", { name: "Zed Park", phone: "208-555-0188", address: "1 Nowhere Rd" });
    const res = await post(agent, "/schedule/date", "/schedule/date", { serviceTypeId: 1, preferredDate: inDays(12) });

    assert.strictEqual(res.status, 302);
    assert.strictEqual(await requestCount(), 1);
});
