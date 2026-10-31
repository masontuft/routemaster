import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "../test/db.js";
import * as Customer from "./customer.js";
import * as Property from "./property.js";
import * as ServiceRequest from "./serviceRequest.js";
import * as AccessLink from "./accessLink.js";

const db = testDb("models");
const pool = db.pool;
let customerId;
let propertyId;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    customerId = await Customer.create(pool, { name: "Ann Lee", phone: "(208) 555-0101" });
    propertyId = await Property.create(pool, customerId, { street: "12 Oak Street", city: "Rexburg" });
});
after(() => {
    return db.close();
});

async function newRequest(overrides = {}) {
    return ServiceRequest.create(pool, {
        customerId, propertyId, serviceTypeId: 1, preferredDate: "2027-01-15", ...overrides,
    });
}

test("a request starts as Requested with one history row", async () => {
    const id = await newRequest();
    const request = await ServiceRequest.findForCustomer(pool, id, customerId);
    assert.strictEqual(request.status, "Requested");
    const history = await ServiceRequest.historyFor(pool, id);
    assert.deepStrictEqual(history.map((row) => {
        return row.status;
    }), ["Requested"]);
});

test("a request with no customer is stored as Needs Review with the typed contact details", async () => {
    const id = await ServiceRequest.create(pool, {
        serviceTypeId: 1, preferredDate: "2027-01-15",
        contact: { name: "Stranger", phone: "2085550000", address: "1 Elm St" },
    });
    const { rows } = await pool.query(
        `SELECT request_statuses.name AS status, contact_name FROM service_requests
         JOIN request_statuses ON request_statuses.id = status_id WHERE service_requests.id = $1`, [id]);
    assert.deepStrictEqual(rows[0], { status: "Needs Review", contact_name: "Stranger" });
});

test("one customer cannot read, change or cancel another customer's request", async () => {
    const id = await newRequest();
    const otherId = await Customer.create(pool, { name: "Bo Kim" });
    assert.strictEqual(await ServiceRequest.findForCustomer(pool, id, otherId), null);
    assert.strictEqual(await ServiceRequest.updateDetails(pool, id, otherId, { preferredDate: "2027-02-01" }), false);
    assert.strictEqual(await ServiceRequest.cancel(pool, id, otherId, null), false);
    assert.strictEqual((await ServiceRequest.findForCustomer(pool, id, customerId)).status, "Requested");
});

test("cancelling adds history, and a cancelled request can no longer be changed or cancelled", async () => {
    const id = await newRequest();
    assert.strictEqual(await ServiceRequest.cancel(pool, id, customerId, null), true);
    assert.strictEqual(await ServiceRequest.cancel(pool, id, customerId, null), false);
    assert.strictEqual(await ServiceRequest.updateDetails(pool, id, customerId, { preferredDate: "2027-02-01" }), false);
    const history = await ServiceRequest.historyFor(pool, id);
    assert.deepStrictEqual(history.map((row) => {
        return row.status;
    }), ["Requested", "Cancelled"]);
});

test("matching needs name, phone and street together", async () => {
    const hit = await Customer.findByContact(pool, { name: "ann  LEE", phone: "208-555-0101", address: "12 oak st." });
    assert.deepStrictEqual(hit, { customer_id: customerId, property_id: propertyId });
    assert.strictEqual(await Customer.findByContact(pool, { name: "Ann Lee", phone: "208-555-9999", address: "12 Oak St" }), null);
    assert.strictEqual(await Customer.findByContact(pool, { name: "Ann Lee", phone: "208-555-0101", address: "99 Oak St" }), null);
    assert.strictEqual(await Customer.findByContact(pool, { name: "Ann Lee", phone: "", address: "12 Oak St" }), null);
});

test("a link works until it expires or is revoked, and the raw token is not stored", async () => {
    const token = await AccessLink.create(pool, { customerId });
    assert.deepStrictEqual((await AccessLink.findValid(pool, token)).customerId, customerId);
    const stored = await pool.query("SELECT token_hash FROM access_links");
    assert.notStrictEqual(stored.rows[0].token_hash, token);
    assert.strictEqual(await AccessLink.findValid(pool, "not-a-real-token"), null);

    await pool.query("UPDATE access_links SET expires_at = now() - interval '1 minute'");
    assert.strictEqual(await AccessLink.findValid(pool, token), null);

    const fresh = await AccessLink.create(pool, { customerId });
    const link = await AccessLink.findValid(pool, fresh);
    await AccessLink.revoke(pool, link.id);
    assert.strictEqual(await AccessLink.findValid(pool, fresh), null);
});

test("a user created for a link customer has no email or password and is reused", async () => {
    const first = await Customer.ensureUser(pool, customerId);
    const second = await Customer.ensureUser(pool, customerId);
    assert.strictEqual(first.id, second.id);
    const { rows } = await pool.query("SELECT email, password_hash FROM users WHERE id = $1", [first.id]);
    assert.deepStrictEqual(rows[0], { email: null, password_hash: null });
});

test("deleting a customer cascades to properties, requests, history and links", async () => {
    const id = await newRequest();
    await AccessLink.create(pool, { customerId });
    await pool.query("DELETE FROM customers WHERE id = $1", [customerId]);
    for (const table of ["properties", "service_requests", "status_history", "access_links"]) {
        const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
        assert.strictEqual(rows[0].n, 0, table);
    }
    assert.ok(id);
});

test("a property, service type or status that a request uses cannot be deleted", async () => {
    await newRequest();
    await assert.rejects(pool.query("DELETE FROM properties WHERE id = $1", [propertyId]), /foreign key/);
    await assert.rejects(pool.query("DELETE FROM service_types WHERE id = 1"), /foreign key/);
    await assert.rejects(pool.query("DELETE FROM request_statuses WHERE name = 'Requested'"), /foreign key/);
});

test("deleting a user keeps the customer and blanks the link", async () => {
    const user = await Customer.ensureUser(pool, customerId);
    await pool.query("DELETE FROM users WHERE id = $1", [user.id]);
    const { rows } = await pool.query("SELECT user_id FROM customers WHERE id = $1", [customerId]);
    assert.strictEqual(rows[0].user_id, null);
});

test("a request cannot mix matched and unmatched shapes", async () => {
    await assert.rejects(
        pool.query(`INSERT INTO service_requests (customer_id, service_type_id, status_id, preferred_date)
                    VALUES (NULL, 1, 1, '2027-01-01')`),
        /service_requests_matched_or_unmatched/,
    );
});
