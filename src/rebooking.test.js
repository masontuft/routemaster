import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "./test/db.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as Area from "./models/area.js";
import * as ServiceRequest from "./models/serviceRequest.js";
import * as AccessLink from "./models/accessLink.js";
import { forArea, classify, countByGroup } from "./models/rebooking.js";

const db = testDb("rebooking");
const pool = db.pool;
let areaId;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    areaId = await Area.create(pool, "Oakwood");
});
after(() => {
    return db.close();
});

async function customerIn(area, name, street = "1 Elm St") {
    const id = await Customer.create(pool, { name, phone: "208-555-0101" });
    const propertyId = await Property.create(pool, id, { street, city: "Rexburg" });

    if (area) {
        await pool.query("UPDATE properties SET subdivision_id = $2 WHERE id = $1", [propertyId, area]);
    }

    return { id, propertyId };
}

// A request for the customer with the given status and dates, however the app would normally get it there.
async function job(customer, status, preferred, scheduled = null) {
    const id = await ServiceRequest.create(pool, {
        customerId: customer.id, propertyId: customer.propertyId, serviceTypeId: 1, preferredDate: preferred,
    });
    await pool.query(
        `UPDATE service_requests SET status_id = (SELECT id FROM request_statuses WHERE name = $2),
                scheduled_date = $3 WHERE id = $1`,
        [id, status, scheduled],
    );
    return id;
}

async function groupOf(name, year = 2026) {
    const found = (await forArea(pool, areaId, year)).find((customer) => {
        return customer.name === name;
    });
    return found?.group;
}

test("completed in an earlier year and nothing this year is the outreach list, with the last service date", async () => {
    const ann = await customerIn(areaId, "Ann");
    await job(ann, "Completed", "2025-09-01", "2025-10-04");
    await job(ann, "Completed", "2024-09-01", "2024-10-02");

    const [row] = await forArea(pool, areaId, 2026);

    assert.strictEqual(row.group, "not_yet_booked");
    assert.strictEqual(row.lastServed, "2025-10-04");
    assert.strictEqual(row.streets, "1 Elm St");
});

test("a request this year of any live kind means booked", async () => {
    const requested = await customerIn(areaId, "Requested");
    const scheduled = await customerIn(areaId, "Scheduled");
    const done = await customerIn(areaId, "Done");
    await job(requested, "Requested", "2026-10-10");
    await job(scheduled, "Scheduled", "2026-10-10", "2026-10-12");
    await job(done, "Completed", "2026-04-10", "2026-04-12");
    for (const customer of [requested, scheduled, done]) {
        await job(customer, "Completed", "2025-10-01", "2025-10-02");
    }

    assert.strictEqual(await groupOf("Requested"), "booked");
    assert.strictEqual(await groupOf("Scheduled"), "booked");
    assert.strictEqual(await groupOf("Done"), "booked");
});

test("cancelled this year is declined, unless they asked again, which is booked", async () => {
    const declined = await customerIn(areaId, "Declined");
    const changed = await customerIn(areaId, "Changed");
    await job(declined, "Completed", "2025-10-01", "2025-10-02");
    await job(declined, "Cancelled", "2026-10-10");
    await job(changed, "Cancelled", "2026-10-10");
    await job(changed, "Requested", "2026-10-20");

    assert.strictEqual(await groupOf("Declined"), "declined");
    assert.strictEqual(await groupOf("Changed"), "booked");
});

test("no past completed job means never served, even with an old cancelled one", async () => {
    await customerIn(areaId, "New");
    const cancelled = await customerIn(areaId, "Cancelled Once");
    await job(cancelled, "Cancelled", "2025-10-01");

    assert.strictEqual(await groupOf("New"), "never_served");
    assert.strictEqual(await groupOf("Cancelled Once"), "never_served");
});

test("the day it was booked for decides the year, not the day it was asked for", async () => {
    const edge = await customerIn(areaId, "Edge");
    await job(edge, "Completed", "2024-09-01", "2024-09-02");
    await job(edge, "Scheduled", "2025-12-30", "2026-01-05");

    assert.strictEqual(await groupOf("Edge", 2026), "booked");
    assert.strictEqual(await groupOf("Edge", 2025), "not_yet_booked");
});

test("only customers with a property in the area appear, once each", async () => {
    const other = await Area.create(pool, "Pine Hills");
    await customerIn(other, "Elsewhere");
    await customerIn(null, "No Area");
    const twice = await customerIn(areaId, "Twice", "1 Elm St");
    const second = await Property.create(pool, twice.id, { street: "2 Elm St", city: "Rexburg" });
    await pool.query("UPDATE properties SET subdivision_id = $2 WHERE id = $1", [second, areaId]);

    const rows = await forArea(pool, areaId, 2026);

    assert.deepStrictEqual(rows.map((row) => {
        return row.name;
    }), ["Twice"]);
    assert.strictEqual(rows[0].streets, "1 Elm St; 2 Elm St");
});

test("contacted means a link made this year, and an active link is one that still works", async () => {
    const fresh = await customerIn(areaId, "Fresh Link");
    const stale = await customerIn(areaId, "Stale Link");
    await customerIn(areaId, "No Link");
    await AccessLink.create(pool, { customerId: fresh.id, days: 30 });
    await AccessLink.create(pool, { customerId: stale.id, days: 30 });
    await pool.query("UPDATE access_links SET created_at = '2025-05-01', expires_at = '2025-06-01' WHERE customer_id = $1", [stale.id]);
    const byName = Object.fromEntries((await forArea(pool, areaId, new Date().getFullYear())).map((row) => {
        return [row.name, row];
    }));

    assert.deepStrictEqual([byName["Fresh Link"].contacted, byName["Fresh Link"].hasActiveLink], [true, true]);
    assert.deepStrictEqual([byName["Stale Link"].contacted, byName["Stale Link"].hasActiveLink], [false, false]);
    assert.deepStrictEqual([byName["No Link"].contacted, byName["No Link"].hasActiveLink], [false, false]);
});

test("an unmatched request, with no customer, is ignored", async () => {
    await ServiceRequest.create(pool, {
        serviceTypeId: 1, preferredDate: "2026-10-10", contact: { name: "Walk In", phone: "208-555-0100", address: "9 Oak" },
    });
    await customerIn(areaId, "Ann");

    assert.deepStrictEqual((await forArea(pool, areaId, 2026)).map((row) => {
        return row.name;
    }), ["Ann"]);
});

test("classify prefers booked over declined over served before, and counts add up", () => {
    assert.strictEqual(classify({ booked: true, cancelledThisYear: true, servedBefore: true }), "booked");
    assert.strictEqual(classify({ booked: false, cancelledThisYear: true, servedBefore: true }), "declined");
    assert.strictEqual(classify({ booked: false, cancelledThisYear: false, servedBefore: true }), "not_yet_booked");
    assert.strictEqual(classify({ booked: false, cancelledThisYear: false, servedBefore: false }), "never_served");
    assert.deepStrictEqual(countByGroup([{ group: "booked" }, { group: "booked" }, { group: "declined" }]), {
        not_yet_booked: 0, declined: 1, never_served: 0, booked: 2,
    });
});
