import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "./test/db.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as Lead from "./models/lead.js";
import * as ServiceRequest from "./models/serviceRequest.js";
import * as Staff from "./models/staff.js";

// A lead made into a customer holds what that person typed, so it goes when the customer does (migration 027).
// A stranger's lead, and a request another customer owns, stay.

const db = testDb("leaddelete");
const pool = db.pool;
const ann = { name: "Ann Lee", phone: "208-555-0101", address: "12 Oak Street" };
let batchId;
let scene;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    scene = await buildScene();
});
after(() => {
    return db.close();
});

async function unmatched(typed) {
    const leadId = await Lead.findOrCreate(pool, 1, typed);
    return ServiceRequest.create(pool, 1, { serviceTypeId: 1, preferredDate: "2030-01-01", leadId });
}

async function count(table) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
}

// Ann was a lead with three requests: one cancelled before anyone matched it, two matched. Ann's lead is converted to
// Ann, then asks again and that request is matched to a different customer, Bo. Cy is a stranger with an open request.
async function buildScene() {
    const batch = await pool.query(
        `INSERT INTO import_batches (sheet_id, sheet_name, season_year, plan_hash, company_id)
         VALUES ('sheet', 'Jobs', 2030, $1, 1) RETURNING id`, ["a".repeat(64)]);
    batchId = batch.rows[0].id;
    const cancelled = await unmatched(ann);
    await Staff.changeStatus(pool, 1, cancelled, { to: "Cancelled", note: "spam", changedBy: null });
    const first = await unmatched(ann);
    await Staff.matchAsNew(pool, 1, first, { city: "Rexburg", zip: "83440" }, null);
    const annId = (await pool.query("SELECT customer_id FROM service_requests WHERE id = $1", [first])).rows[0].customer_id;
    await pool.query("UPDATE customers SET import_batch_id = $2 WHERE id = $1", [annId, batchId]);

    const boId = await Customer.create(pool, 1, { name: "Bo Kim", phone: "208-555-0202" });
    const boProperty = await Property.create(pool, boId, { street: "9 Elm Street", city: "Rexburg" });
    const again = await unmatched(ann);
    await Staff.matchToProperty(pool, 1, again, boProperty, null);

    const stranger = await unmatched({ name: "Cy Doe", phone: "208-555-0303", address: "7 Birch Lane" });
    return { annId, boId, cancelled, first, again, stranger };
}

test("the counts include the customer's leads and the unmatched requests that point at them", async () => {
    const counts = await Customer.countRelated(pool, 1, scene.annId);

    // Ann's one matched request, plus the cancelled one nobody matched. Bo's request is not Ann's.
    assert.strictEqual(counts.leads, 1);
    assert.strictEqual(counts.requests, 2);
});

test("deleting a customer deletes their lead and unmatched requests, and leaves other customers' requests", async () => {
    assert.strictEqual(await Customer.remove(pool, 1, scene.annId), true);

    const leads = await pool.query("SELECT name FROM leads");
    assert.deepStrictEqual(leads.rows, [{ name: "Cy Doe" }]);
    const left = await pool.query("SELECT id, customer_id, lead_id FROM service_requests ORDER BY id");
    assert.deepStrictEqual(left.rows.map((row) => {
        return row.id;
    }), [scene.again, scene.stranger]);
    assert.strictEqual(left.rows[0].customer_id, scene.boId);
    assert.strictEqual(left.rows[0].lead_id, null);
    assert.ok(left.rows[1].lead_id);
});

test("clearing every customer takes the converted leads and keeps the stranger's", async () => {
    const counts = await Customer.countClear(pool, 1, null);
    assert.deepStrictEqual([counts.customers, counts.leads, counts.requests], [2, 1, 3]);

    const result = await Customer.clear(pool, 1, null, counts);
    assert.strictEqual(result.deleted, true);
    assert.deepStrictEqual((await pool.query("SELECT name FROM leads")).rows, [{ name: "Cy Doe" }]);
    assert.deepStrictEqual((await pool.query("SELECT id FROM service_requests")).rows, [{ id: scene.stranger }]);
});

test("clearing one import batch takes only that batch's customers and their leads", async () => {
    const counts = await Customer.countClear(pool, 1, batchId);
    assert.deepStrictEqual([counts.customers, counts.leads, counts.requests], [1, 1, 2]);

    assert.strictEqual((await Customer.clear(pool, 1, batchId, counts)).deleted, true);
    assert.strictEqual(await count("customers"), 1);
    assert.strictEqual(await count("leads"), 1);
    assert.strictEqual(await count("service_requests"), 2);
});

test("a clear is refused when a lead appeared after the owner looked", async () => {
    const seen = await Customer.countClear(pool, 1, null);
    await Customer.update(pool, 1, scene.boId, { name: "Bo Kim" });
    const boLead = await Lead.findOrCreate(pool, 1, { name: "Bo Kim", phone: "208-555-0202", address: "9 Elm Street" });
    await Lead.markConverted(pool, 1, boLead, scene.boId);

    const result = await Customer.clear(pool, 1, null, seen);
    assert.strictEqual(result.deleted, false);
    assert.strictEqual(await count("customers"), 2);
});

test("a delete that skips the unmatched requests fails instead of keeping the typed details", async () => {
    await assert.rejects(pool.query("DELETE FROM customers WHERE id = $1", [scene.annId]), {
        constraint: "service_requests_matched_or_unmatched",
    });
    assert.strictEqual(await count("customers"), 2);
});
