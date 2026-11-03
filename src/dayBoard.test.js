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
import { hashPassword } from "./utils/password.js";

const db = testDb("dayboard");
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

function inDays(count) {
    return new Date(Date.now() + count * 86400000).toISOString().slice(0, 10);
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
    await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName });
    await send(agent, "/login", "/login", { email, password: "longenough" });
    return agent;
}

// One customer with one property, optionally in an area, and one Requested job for the given day.
async function requestFor(name, street, preferredDate, areaId = null) {
    const customerId = await Customer.create(pool, { name, phone: "208-555-0101" });
    const propertyId = await Property.create(pool, customerId, { street, city: "Rexburg" });

    if (areaId) {
        await pool.query("UPDATE properties SET subdivision_id = $2 WHERE id = $1", [propertyId, areaId]);
    }

    return ServiceRequest.create(pool, { customerId, propertyId, serviceTypeId: 1, preferredDate });
}

async function statusOf(id) {
    const { rows } = await pool.query(
        `SELECT request_statuses.name AS status, to_char(scheduled_date, 'YYYY-MM-DD') AS day
         FROM service_requests JOIN request_statuses ON request_statuses.id = service_requests.status_id
         WHERE service_requests.id = $1`,
        [id],
    );
    return rows[0];
}

const BOARD = "/staff/day-board";
const book = (agent, fields) => {
    return send(agent, BOARD, `${BOARD}/schedule`, fields);
};

test("the board lists waiting requests for a day with their area, and not other days", async () => {
    const areaId = await Area.create(pool, "Oakwood");
    await requestFor("Ann Lee", "1 Elm St", inDays(3), areaId);
    await requestFor("Bob Ray", "2 Elm St", inDays(4));
    const dispatcher = await agentFor("dispatcher");

    const page = await dispatcher.get(`${BOARD}?day=${inDays(3)}`);

    assert.strictEqual(page.status, 200);
    assert.match(page.text, /Ann Lee/);
    assert.match(page.text, /Oakwood/);
    assert.doesNotMatch(page.text, /Bob Ray/);
    assert.match(page.headers["cache-control"], /no-store/);
    assert.match(page.text, new RegExp(`${inDays(4)}</a>: 1 waiting`));
});

test("booking schedules the ticked requests for that day and writes history", async () => {
    const first = await requestFor("Ann Lee", "1 Elm St", inDays(3));
    const second = await requestFor("Bob Ray", "2 Elm St", inDays(3));
    const third = await requestFor("Cy Dole", "3 Elm St", inDays(3));
    const dispatcher = await agentFor("dispatcher");

    const res = await book(dispatcher, { day: inDays(3), requestIds: [String(first), String(second)] });

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /Scheduled 2 for/);
    assert.deepStrictEqual(await statusOf(first), { status: "Scheduled", day: inDays(3) });
    assert.deepStrictEqual(await statusOf(second), { status: "Scheduled", day: inDays(3) });
    assert.strictEqual((await statusOf(third)).status, "Requested");
    const history = await ServiceRequest.historyFor(pool, first);
    assert.strictEqual(history.at(-1).status, "Scheduled");
});

test("one ticked box arrives as a string and still books", async () => {
    const id = await requestFor("Ann Lee", "1 Elm St", inDays(3));
    const dispatcher = await agentFor("dispatcher");

    await book(dispatcher, { day: inDays(3), requestIds: String(id) });

    assert.strictEqual((await statusOf(id)).status, "Scheduled");
});

test("a request that is not Requested is skipped, not rebooked, and the rest still book", async () => {
    const booked = await requestFor("Ann Lee", "1 Elm St", inDays(3));
    const fresh = await requestFor("Bob Ray", "2 Elm St", inDays(3));
    const dispatcher = await agentFor("dispatcher");
    await book(dispatcher, { day: inDays(5), requestIds: String(booked) });

    const res = await book(dispatcher, { day: inDays(3), requestIds: [String(booked), String(fresh), "9999", String(fresh)] });

    assert.match(res.text, /Scheduled 1 for/);
    assert.match(res.text, /2 could not be scheduled/);
    assert.deepStrictEqual(await statusOf(booked), { status: "Scheduled", day: inDays(5) });
    assert.strictEqual((await statusOf(fresh)).day, inDays(3));
});

test("bad input books nothing: no ticks, a past day, a bad day", async () => {
    const id = await requestFor("Ann Lee", "1 Elm St", inDays(3));
    const dispatcher = await agentFor("dispatcher");

    const none = await book(dispatcher, { day: inDays(3) });
    const past = await book(dispatcher, { day: "2020-01-01", requestIds: String(id) });
    const bad = await book(dispatcher, { day: "soon", requestIds: String(id) });

    assert.strictEqual(none.status, 400);
    assert.match(none.text, /Tick at least one/);
    assert.strictEqual(past.status, 400);
    assert.match(past.text, /today or later/);
    assert.strictEqual(bad.status, 400);
    assert.strictEqual((await statusOf(id)).status, "Requested");
});

test("the model caps one batch at its limit", async () => {
    const ids = Array.from({ length: DayBoard.MAX_SCHEDULE + 5 }, (unused, index) => {
        return index + 1;
    });

    const result = await DayBoard.scheduleMany(pool, ids, { day: inDays(3), changedBy: null });

    assert.deepStrictEqual(result, { scheduled: 0, skipped: DayBoard.MAX_SCHEDULE });
});

test("customers and signed-out visitors cannot use the board", async () => {
    const id = await requestFor("Ann Lee", "1 Elm St", inDays(3));
    const customer = await agentFor("customer");

    assert.strictEqual((await request(server).get(BOARD)).status, 302);
    assert.strictEqual((await customer.get(BOARD)).status, 403);
    const res = await customer.post(`${BOARD}/schedule`).type("form").send({ day: inDays(3), requestIds: String(id) });
    assert.notStrictEqual(res.status, 200);
    assert.strictEqual((await statusOf(id)).status, "Requested");
});
