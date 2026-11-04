import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as Area from "./models/area.js";
import * as ServiceRequest from "./models/serviceRequest.js";
import * as DayBoard from "./models/dayBoard.js";
import * as RoutePlan from "./models/routePlan.js";
import * as AppSetting from "./models/appSetting.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("routeplans");
const pool = db.pool;
let app;
let server;
let asked;
let geocodeMode;

// A pretend map: "N Something" sits N hundredths of a degree north of 43.5. "Nowhere" is not found.
async function fakeGeocode(address) {
    asked.push(address);

    if (geocodeMode === "down") {
        return { status: "error", reason: "down" };
    }

    const number = Number(address.match(/^(\d+)/)?.[1]);

    if (address.includes("Nowhere") || Number.isNaN(number)) {
        return { status: "none" };
    }

    return { status: "found", lat: 43.5 + number * 0.01, lng: -116.5, source: "google" };
}

function listen(application) {
    return new Promise((resolve) => {
        const started = application.listen(0, () => {
            resolve(started);
        });
    });
}

function inDays(count) {
    return new Date(Date.now() + count * 86400000).toISOString().slice(0, 10);
}

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    asked = [];
    geocodeMode = "up";
    server?.close();
    app?.locals.sessionStore.close();
    app = createApp({
        pool, sessionSecret: "test-secret", geocode: fakeGeocode, serviceState: "ID",
        routeStartAddress: "0 Depot Rd, Rexburg",
    });
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
    await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName });
    await send(agent, "/login", "/login", { email, password: "longenough" });
    return agent;
}

const DAY = inDays(3);

// A customer on "<number> Elm St", booked for DAY. Returns the request id.
async function booked(number, name = `Customer ${number}`) {
    const customerId = await Customer.create(pool, { name, phone: "208-555-0101" });
    const propertyId = await Property.create(pool, customerId, { street: `${number} Elm St`, city: "Rexburg" });
    const id = await ServiceRequest.create(pool, {
        customerId, propertyId, serviceTypeId: 1, preferredDate: DAY, notes: `note ${number}`,
    });
    await DayBoard.scheduleMany(pool, [id], { day: DAY, changedBy: null });
    return { id, propertyId };
}

const PAGE = `/staff/routes?day=${DAY}`;
const locate = (agent, fields = {}) => {
    return send(agent, PAGE, "/staff/routes/locate", { day: DAY, ...fields });
};
const build = (agent, fields = {}) => {
    return send(agent, PAGE, "/staff/routes/build", {
        day: DAY, startAddress: "0 Depot Rd, Rexburg", startTime: "08:30", serviceMinutes: "15", ...fields,
    });
};

async function routeCount() {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM routes");
    return rows[0].n;
}

function stopOrder(html) {
    return [...html.matchAll(/Customer (\d+)<\/a>/g)].map((match) => {
        return Number(match[1]);
    });
}

test("the page counts booked jobs and offers to find locations, with the start address prefilled", async () => {
    await booked(1);
    await booked(2);
    const dispatcher = await agentFor("dispatcher");

    const page = await dispatcher.get(PAGE);

    assert.strictEqual(page.status, 200);
    assert.match(page.text, /2 booked: 0 with a map point, 2 still to look up/);
    assert.match(page.text, /Find Locations/);
    assert.match(page.headers["cache-control"], /no-store/);
    assert.ok(page.text.includes('value="0 Depot Rd, Rexburg"') === false, "no build form until something is located");
});

test("finding locations saves points, includes the state in the lookup, and unlocks the build form", async () => {
    await booked(1);
    const dispatcher = await agentFor("dispatcher");

    const res = await locate(dispatcher);

    assert.match(res.text, /Found 1\./);
    assert.deepStrictEqual(asked, ["1 Elm St, Rexburg, ID"]);
    assert.match(res.text, /Build the Route/);
    assert.ok(res.text.includes('value="0 Depot Rd, Rexburg"'));
});

test("building orders the stops by distance, saves one route, and shows times and map links", async () => {
    await booked(3);
    await booked(1);
    await booked(2);
    const dispatcher = await agentFor("dispatcher");
    await locate(dispatcher);

    const res = await build(dispatcher);

    assert.match(res.text, /Route built with 3 stops/);
    assert.deepStrictEqual(stopOrder(res.text), [1, 2, 3]);
    assert.match(res.text, /8:3\d AM/);
    assert.match(res.text, /https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);
    assert.strictEqual(await routeCount(), 1);
    const saved = await RoutePlan.findForDay(pool, DAY);
    assert.deepStrictEqual(saved.stops.map((stop) => {
        return stop.position;
    }), [1, 2, 3]);
    assert.ok(saved.total_miles > 0);
});

test("building again replaces the route instead of adding a second", async () => {
    await booked(1);
    const dispatcher = await agentFor("dispatcher");
    await locate(dispatcher);
    await build(dispatcher);

    await build(dispatcher, { startTime: "10:00" });

    assert.strictEqual(await routeCount(), 1);
    assert.strictEqual((await RoutePlan.findForDay(pool, DAY)).start_time, "10:00");
});

test("a job booked after the route was built makes the page say the route is out of date", async () => {
    await booked(1);
    const dispatcher = await agentFor("dispatcher");
    await locate(dispatcher);
    await build(dispatcher);
    assert.doesNotMatch((await dispatcher.get(PAGE)).text, /have changed since/);

    await booked(2);

    assert.match((await dispatcher.get(PAGE)).text, /have changed since this route was built/);
});

test("changing an area's city after a route was built flags it, and finding the points again keeps it flagged", async () => {
    const job = await booked(1);
    const area = await Area.create(pool, "Oakwood");
    await pool.query("UPDATE properties SET city = NULL, subdivision_id = $2 WHERE id = $1", [job.propertyId, area]);
    await Area.setCity(pool, area, "Rexburg");
    const dispatcher = await agentFor("dispatcher");
    await locate(dispatcher);
    await build(dispatcher);
    const fresh = await dispatcher.get(PAGE);
    assert.doesNotMatch(fresh.text, /have changed since/);
    assert.match(fresh.text, /Map Links/);

    await Area.setCity(pool, area, "Ammon");

    const cleared = await dispatcher.get(PAGE);
    assert.match(cleared.text, /map points have changed since this route was built/);
    await locate(dispatcher);
    assert.match((await dispatcher.get(PAGE)).text, /map points have changed since this route was built/);
});

test("addresses that are not found are listed with an edit link, left off the route, and can be retried", async () => {
    await booked(1);
    const lost = await booked(2);
    await pool.query("UPDATE properties SET street = 'Nowhere Ln' WHERE id = $1", [lost.propertyId]);
    const dispatcher = await agentFor("dispatcher");

    const found = await locate(dispatcher);
    assert.match(found.text, /1 could not be found/);
    assert.match(found.text, /Addresses to Fix/);
    assert.ok(found.text.includes(`/staff/properties/${lost.propertyId}/edit`));

    const built = await build(dispatcher);
    assert.match(built.text, /Route built with 1 stops\. 1 booked job was left off/);

    await pool.query("UPDATE properties SET street = '2 Elm St' WHERE id = $1", [lost.propertyId]);
    await pool.query("UPDATE properties SET geocode_status = 'failed' WHERE id = $1", [lost.propertyId]);
    const retried = await locate(dispatcher, { retryFailed: "1" });
    assert.match(retried.text, /Found 1\./);
});

test("a map service error keeps addresses pending and says to try again", async () => {
    const { propertyId } = await booked(1);
    const dispatcher = await agentFor("dispatcher");
    geocodeMode = "down";

    const res = await locate(dispatcher);

    assert.match(res.text, /did not answer/);
    const { rows } = await pool.query("SELECT geocode_status FROM properties WHERE id = $1", [propertyId]);
    assert.strictEqual(rows[0].geocode_status, "pending");
});

test("building is refused, and nothing saved, with no located job, a missing start, or a service outage", async () => {
    await booked(1);
    const dispatcher = await agentFor("dispatcher");

    const none = await build(dispatcher);
    assert.strictEqual(none.status, 400);
    assert.match(none.text, /Find locations first/);

    await locate(dispatcher);
    const lostStart = await build(dispatcher, { startAddress: "Nowhere at all" });
    assert.strictEqual(lostStart.status, 400);
    assert.match(lostStart.text, /start address could not be found/);

    geocodeMode = "down";
    const down = await build(dispatcher);
    assert.strictEqual(down.status, 502);
    assert.strictEqual(await routeCount(), 0);
});

test("bad form values are refused with a message and nothing is built", async () => {
    await booked(1);
    const dispatcher = await agentFor("dispatcher");
    await locate(dispatcher);

    const badTime = await build(dispatcher, { startTime: "25:99" });
    const badMinutes = await build(dispatcher, { serviceMinutes: "1" });
    const shortAddress = await build(dispatcher, { startAddress: "x" });
    const pastDay = await build(dispatcher, { day: "2020-01-01" });

    assert.match(badTime.text, /Choose a start time/);
    assert.match(badMinutes.text, /5 to 120 minutes/);
    assert.match(shortAddress.text, /address the route starts from/);
    assert.match(pastDay.text, /today or later/);
    assert.strictEqual(await routeCount(), 0);
});

test("customers and signed-out visitors cannot reach routes", async () => {
    await booked(1);
    const customer = await agentFor("customer");

    assert.strictEqual((await request(server).get("/staff/routes")).status, 302);
    assert.strictEqual((await customer.get("/staff/routes")).status, 403);
    const res = await customer.post("/staff/routes/build").type("form").send({ day: DAY });
    assert.notStrictEqual(res.status, 200);
    assert.strictEqual(await routeCount(), 0);
});

// Marks a booked job as penciled in, the way the day board would have left it.
async function makeTentative(id) {
    await pool.query("UPDATE service_requests SET tentative = true WHERE id = $1", [id]);
}

test("with the option off, tentative jobs are left off the route, not looked up, and the page says so", async () => {
    await booked(1);
    const penciled = await booked(2);
    await makeTentative(penciled.id);
    const dispatcher = await agentFor("dispatcher");

    const page = await dispatcher.get(PAGE);
    assert.match(page.text, /1 tentative job is not on this route/);
    assert.match(page.text, /1 booked: 0 with a map point/);

    await locate(dispatcher);
    assert.deepStrictEqual(asked, ["1 Elm St, Rexburg, ID"]);

    const built = await build(dispatcher);
    assert.match(built.text, /Route built with 1 stops/);
    assert.deepStrictEqual(stopOrder(built.text), [1]);
});

test("with the option on, tentative jobs are on the route, marked, and counted", async () => {
    await AppSetting.set(pool, "allow_tentative_booking", "on", null);
    await booked(1);
    const penciled = await booked(2);
    await makeTentative(penciled.id);
    const dispatcher = await agentFor("dispatcher");
    await locate(dispatcher);

    const built = await build(dispatcher);

    assert.match(built.text, /Route built with 2 stops/);
    assert.deepStrictEqual(stopOrder(built.text), [1, 2]);
    assert.match(built.text, /Customer 2<\/a> \(tentative\)/);
    assert.doesNotMatch(built.text, /Customer 1<\/a> \(tentative\)/);
    assert.match(built.text, /1 of them is tentative/);
    assert.doesNotMatch(built.text, /is not on this route/);
});

test("turning the option off after a route was built flags the route as out of date", async () => {
    await AppSetting.set(pool, "allow_tentative_booking", "on", null);
    const penciled = await booked(1);
    await makeTentative(penciled.id);
    const dispatcher = await agentFor("dispatcher");
    await locate(dispatcher);
    await build(dispatcher);
    assert.doesNotMatch((await dispatcher.get(PAGE)).text, /have changed since/);

    await AppSetting.set(pool, "allow_tentative_booking", "off", null);

    const page = await dispatcher.get(PAGE);
    assert.match(page.text, /includes tentative jobs, and booking customers who have not confirmed is turned off/);
    assert.doesNotMatch(page.text, /Route stops/);
    assert.doesNotMatch(page.text, /Map Links/);
});
