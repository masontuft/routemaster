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
import * as AccessLink from "./models/accessLink.js";
import * as AppSetting from "./models/appSetting.js";
import * as DayBoard from "./models/dayBoard.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("tentative");
const pool = db.pool;
let app;
let server;
let areaId;

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

const DAY = inDays(5);
const OTHER_DAY = inDays(12);
const LAST_YEAR = `${Number(DAY.slice(0, 4)) - 1}-09-15`;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    server?.close();
    app?.locals.sessionStore.close();
    app = createApp({ pool, sessionSecret: "test-secret" });
    server = await listen(app);
    areaId = await Area.create(pool, "Oakwood");
    await Area.addDays(pool, areaId, [DAY, OTHER_DAY]);
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

async function staffAgent(roleName = "dispatcher") {
    const agent = request.agent(server);
    const email = `${roleName}@example.com`;
    await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName });
    await send(agent, "/login", "/login", { email, password: "longenough" });
    return agent;
}

// Signs in as the customer the way they would, through a link.
async function customerAgent(customerId) {
    const agent = request.agent(server);
    const token = await AccessLink.create(pool, { customerId, days: 30 });
    await send(agent, `/l/${token}`, `/l/${token}`, {});
    return agent;
}

// A customer in the area, served last year with the given service type.
async function servedLastYear(name, { serviceTypeId = 1, area = areaId, street = "1 Elm St" } = {}) {
    const id = await Customer.create(pool, { name, phone: "208-555-0101" });
    const propertyId = await Property.create(pool, id, { street, city: "Rexburg" });
    await pool.query("UPDATE properties SET subdivision_id = $2 WHERE id = $1", [propertyId, area]);
    const requestId = await ServiceRequest.create(pool, {
        customerId: id, propertyId, serviceTypeId, preferredDate: LAST_YEAR,
    });
    await pool.query(
        "UPDATE service_requests SET status_id = (SELECT id FROM request_statuses WHERE name = 'Completed') WHERE id = $1",
        [requestId],
    );
    return { id, propertyId };
}

async function latestRequest(customerId) {
    const { rows } = await pool.query(
        `SELECT service_requests.id, request_statuses.name AS status, tentative, property_id, service_type_id,
                to_char(preferred_date, 'YYYY-MM-DD') AS preferred, to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled
         FROM service_requests JOIN request_statuses ON request_statuses.id = service_requests.status_id
         WHERE customer_id = $1 ORDER BY service_requests.id DESC LIMIT 1`,
        [customerId],
    );
    return rows[0];
}

async function historyNotes(requestId) {
    return (await ServiceRequest.historyFor(pool, requestId)).map((entry) => {
        return `${entry.status}: ${entry.note}`;
    });
}

const BOARD = `/staff/day-board?day=${DAY}`;
const pencil = (agent, fields = {}) => {
    return send(agent, BOARD, "/staff/day-board/pencil", { day: DAY, ...fields });
};

test("with the option off, the board hides the section and the post is refused", async () => {
    const ann = await servedLastYear("Ann Lee");
    const dispatcher = await staffAgent();

    const page = await dispatcher.get(BOARD);
    const res = await pencil(dispatcher, { customerIds: String(ann.id) });

    assert.doesNotMatch(page.text, /Not Confirmed Yet/);
    assert.strictEqual(res.status, 400);
    assert.match(res.text, /turned off/);
    assert.strictEqual((await latestRequest(ann.id)).status, "Completed");
});

test("with the option on, the board lists customers served before in areas that work the day", async () => {
    await AppSetting.set(pool, "allow_tentative_booking", "on", null);
    await servedLastYear("Ann Lee");
    const noDay = await Area.create(pool, "Pine Hills");
    await servedLastYear("Wrong Area", { area: noDay, street: "2 Pine Rd" });
    const booked = await servedLastYear("Already Booked", { street: "3 Elm St" });
    await ServiceRequest.create(pool, {
        customerId: booked.id, propertyId: booked.propertyId, serviceTypeId: 1, preferredDate: DAY,
    });
    const dispatcher = await staffAgent();

    const page = await dispatcher.get(BOARD);

    assert.match(page.text, /Not Confirmed Yet/);
    assert.match(page.text, /aria-label="Pencil in Ann Lee"/);
    assert.doesNotMatch(page.text, /Pencil in Wrong Area/);
    assert.doesNotMatch(page.text, /Pencil in Already Booked/);
});

test("penciling in makes a tentative Scheduled request for the same service, on the area property, with history", async () => {
    await AppSetting.set(pool, "allow_tentative_booking", "on", null);
    const ann = await servedLastYear("Ann Lee", { serviceTypeId: 2 });
    const dispatcher = await staffAgent();

    const res = await pencil(dispatcher, { customerIds: String(ann.id) });

    assert.match(res.text, /Penciled in 1 for/);
    const created = await latestRequest(ann.id);
    assert.deepStrictEqual(
        [
            created.status, created.tentative, created.preferred, created.scheduled,
            created.service_type_id, created.property_id,
        ],
        ["Scheduled", true, DAY, DAY, 2, ann.propertyId],
    );
    assert.match((await historyNotes(created.id)).at(-1), /Scheduled: Penciled in for .*has not confirmed/);
    assert.match(res.text, /Tentative/);
});

test("a customer is skipped when already booked this year, outside a working area, or penciled in twice", async () => {
    await AppSetting.set(pool, "allow_tentative_booking", "on", null);
    const ann = await servedLastYear("Ann Lee");
    const noDay = await Area.create(pool, "Pine Hills");
    const outside = await servedLastYear("Outside", { area: noDay, street: "2 Pine Rd" });
    const dispatcher = await staffAgent();

    const first = await pencil(dispatcher, { customerIds: [String(ann.id), String(outside.id), "99999"] });
    assert.match(first.text, /Penciled in 1 for/);
    assert.match(first.text, /2 could not be penciled in/);

    const again = await pencil(dispatcher, { customerIds: String(ann.id) });
    assert.match(again.text, /Penciled in 0 for/);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM service_requests WHERE customer_id = $1", [ann.id]);
    assert.strictEqual(rows[0].n, 2);
});

test("the service falls back to the first active one when the last service is switched off", async () => {
    await AppSetting.set(pool, "allow_tentative_booking", "on", null);
    const ann = await servedLastYear("Ann Lee", { serviceTypeId: 2 });
    await pool.query("UPDATE service_types SET active = false WHERE id = 2");

    await DayBoard.pencilIn(pool, [ann.id], { day: DAY, changedBy: null });

    assert.strictEqual((await latestRequest(ann.id)).service_type_id, 1);
});

test("bad input pencils nobody: no ticks, a past day", async () => {
    await AppSetting.set(pool, "allow_tentative_booking", "on", null);
    const ann = await servedLastYear("Ann Lee");
    const dispatcher = await staffAgent();

    const none = await pencil(dispatcher);
    const past = await pencil(dispatcher, { day: "2020-01-01", customerIds: String(ann.id) });

    assert.match(none.text, /Tick at least one customer/);
    assert.match(past.text, /today or later/);
    assert.strictEqual((await latestRequest(ann.id)).status, "Completed");
});

test("the customer sees the penciled-in day and confirming it keeps the booking", async () => {
    const ann = await servedLastYear("Ann Lee");
    await DayBoard.pencilIn(pool, [ann.id], { day: DAY, changedBy: null });
    const created = await latestRequest(ann.id);
    const agent = await customerAgent(ann.id);

    assert.match((await agent.get("/requests")).text, /please confirm/);
    const page = await agent.get(`/requests/${created.id}`);
    assert.match(page.text, /Please Confirm Your Day/);

    await send(agent, `/requests/${created.id}`, `/requests/${created.id}/confirm`, {});

    const after = await latestRequest(ann.id);
    assert.deepStrictEqual([after.status, after.tentative, after.scheduled], ["Scheduled", false, DAY]);
    assert.match((await historyNotes(created.id)).at(-1), /Confirmed by customer/);
    assert.doesNotMatch((await agent.get(`/requests/${created.id}`)).text, /Please Confirm Your Day/);
});

test("choosing a different day returns the request to Requested for staff to book, and the same day confirms", async () => {
    const ann = await servedLastYear("Ann Lee");
    const bob = await servedLastYear("Bob Ray", { street: "2 Elm St" });
    await DayBoard.pencilIn(pool, [ann.id, bob.id], { day: DAY, changedBy: null });
    const annRequest = await latestRequest(ann.id);
    const bobRequest = await latestRequest(bob.id);
    const annAgent = await customerAgent(ann.id);
    const bobAgent = await customerAgent(bob.id);

    const annEdit = `/requests/${annRequest.id}/edit`;
    const bobEdit = `/requests/${bobRequest.id}/edit`;
    await send(annAgent, annEdit, annEdit, { preferredDate: OTHER_DAY, notes: "" });
    await send(bobAgent, bobEdit, bobEdit, { preferredDate: DAY, notes: "gate code 1" });

    const moved = await latestRequest(ann.id);
    assert.deepStrictEqual([moved.status, moved.tentative, moved.preferred, moved.scheduled], ["Requested", false, OTHER_DAY, null]);
    assert.match((await historyNotes(moved.id)).at(-1), /Customer chose a different day/);
    const kept = await latestRequest(bob.id);
    assert.deepStrictEqual([kept.status, kept.tentative, kept.scheduled], ["Scheduled", false, DAY]);
});

test("declining a penciled-in day cancels it, and a customer cannot confirm someone else's", async () => {
    const ann = await servedLastYear("Ann Lee");
    const bob = await servedLastYear("Bob Ray", { street: "2 Elm St" });
    await DayBoard.pencilIn(pool, [ann.id], { day: DAY, changedBy: null });
    const created = await latestRequest(ann.id);
    const bobAgent = await customerAgent(bob.id);
    const annAgent = await customerAgent(ann.id);

    const forged = await bobAgent.post(`/requests/${created.id}/confirm`).type("form").send({ _csrf: await tokenFrom(bobAgent, "/requests") });
    assert.strictEqual(forged.status, 404);
    assert.strictEqual((await latestRequest(ann.id)).tentative, true);

    await send(annAgent, `/requests/${created.id}`, `/requests/${created.id}/cancel`, {});
    const after = await latestRequest(ann.id);
    assert.deepStrictEqual([after.status, after.tentative], ["Cancelled", false]);
});

test("staff can mark a penciled-in booking confirmed, and completing one clears the flag", async () => {
    const ann = await servedLastYear("Ann Lee");
    const bob = await servedLastYear("Bob Ray", { street: "2 Elm St" });
    await DayBoard.pencilIn(pool, [ann.id, bob.id], { day: DAY, changedBy: null });
    const annRequest = await latestRequest(ann.id);
    const bobRequest = await latestRequest(bob.id);
    const dispatcher = await staffAgent();

    const page = await dispatcher.get(`/staff/requests/${annRequest.id}`);
    assert.match(page.text, /Scheduled \(tentative\)/);
    await send(dispatcher, `/staff/requests/${annRequest.id}`, `/staff/requests/${annRequest.id}/confirm`, {});
    assert.strictEqual((await latestRequest(ann.id)).tentative, false);
    assert.match((await historyNotes(annRequest.id)).at(-1), /Confirmed by staff/);

    await send(dispatcher, `/staff/requests/${bobRequest.id}`, `/staff/requests/${bobRequest.id}/status`, { status: "Completed" });
    const done = await latestRequest(bob.id);
    assert.deepStrictEqual([done.status, done.tentative], ["Completed", false]);

    const repeat = await send(dispatcher, `/staff/requests/${annRequest.id}`, `/staff/requests/${annRequest.id}/confirm`, {});
    assert.strictEqual(repeat.status, 302);
    assert.strictEqual((await historyNotes(annRequest.id)).filter((note) => {
        return note.includes("Confirmed by staff");
    }).length, 1);
});

test("a customer cannot pencil anyone in", async () => {
    await AppSetting.set(pool, "allow_tentative_booking", "on", null);
    const ann = await servedLastYear("Ann Lee");
    const agent = await customerAgent(ann.id);

    const res = await agent.post("/staff/day-board/pencil").type("form").send({ day: DAY, customerIds: String(ann.id) });

    assert.notStrictEqual(res.status, 200);
    assert.strictEqual((await latestRequest(ann.id)).status, "Completed");
});
