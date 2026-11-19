import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "../test/db.js";
import * as Customer from "./customer.js";
import * as Property from "./property.js";
import * as ServiceRequest from "./serviceRequest.js";
import * as AccessLink from "./accessLink.js";
import * as Lead from "./lead.js";

const db = testDb("models");
const pool = db.pool;
let customerId;
let propertyId;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    customerId = await Customer.create(pool, 1, { name: "Ann Lee", phone: "(208) 555-0101" });
    propertyId = await Property.create(pool, customerId, { street: "12 Oak Street", city: "Rexburg" });
});
after(() => {
    return db.close();
});

async function newRequest(overrides = {}) {
    return ServiceRequest.create(pool, 1, {
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

test("a request with no customer is stored as Needs Review and points at its lead", async () => {
    const leadId = await Lead.findOrCreate(pool, 1, { name: "Stranger", phone: "2085550000", address: "1 Elm St" });
    const id = await ServiceRequest.create(pool, 1, { serviceTypeId: 1, preferredDate: "2027-01-15", leadId });
    const { rows } = await pool.query(
        `SELECT request_statuses.name AS status, leads.name AS lead_name FROM service_requests
         JOIN request_statuses ON request_statuses.id = status_id
         JOIN leads ON leads.id = service_requests.lead_id WHERE service_requests.id = $1`, [id]);
    assert.deepStrictEqual(rows[0], { status: "Needs Review", lead_name: "Stranger" });
});

test("a request with neither a customer nor a lead is refused by the database", async () => {
    await assert.rejects(ServiceRequest.create(pool, 1, { serviceTypeId: 1, preferredDate: "2027-01-15" }), {
        constraint: "service_requests_matched_or_unmatched",
    });
});

test("one customer cannot read, change or cancel another customer's request", async () => {
    const id = await newRequest();
    const otherId = await Customer.create(pool, 1, { name: "Bo Kay" });
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
    const hit = await Customer.findByContact(pool, 1, { name: "ann  LEE", phone: "208-555-0101", address: "12 oak st." });
    assert.deepStrictEqual(hit, { customer_id: customerId, property_id: propertyId });
    assert.strictEqual(await Customer.findByContact(pool, 1, { name: "Ann Lee", phone: "208-555-9999", address: "12 Oak St" }), null);
    assert.strictEqual(await Customer.findByContact(pool, 1, { name: "Ann Lee", phone: "208-555-0101", address: "99 Oak St" }), null);
    assert.strictEqual(await Customer.findByContact(pool, 1, { name: "Ann Lee", phone: "", address: "12 Oak St" }), null);
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

test("updating a customer recomputes what matching reads, and leaves other fields alone", async () => {
    assert.strictEqual(await Customer.update(pool, 1, customerId, { name: "Ann  Lee-Smith", phone: "(208) 555-0199" }), true);

    const found = await Customer.findByContact(pool, 1, {
        name: "ann lee smith", phone: "208-555-0199", address: "12 oak st",
    });
    assert.strictEqual(found.customer_id, customerId);
    const old = await Customer.findByContact(pool, 1, { name: "Ann Lee", phone: "(208) 555-0101", address: "12 Oak Street" });
    assert.strictEqual(old, null);
    assert.strictEqual((await Customer.findById(pool, 1, customerId)).email, null);
});

test("a blank phone or email is stored as NULL, and a missing customer or empty change updates nothing", async () => {
    await Customer.update(pool, 1, customerId, { email: "ann@example.com" });
    await Customer.update(pool, 1, customerId, { phone: "", email: "" });
    const customer = await Customer.findById(pool, 1, customerId);
    assert.deepStrictEqual([customer.phone, customer.email], [null, null]);
    const { rows } = await pool.query("SELECT phone_normalized FROM customers WHERE id = $1", [customerId]);
    assert.strictEqual(rows[0].phone_normalized, null);

    assert.strictEqual(await Customer.update(pool, 1, 999999, { name: "Nobody" }), false);
    assert.strictEqual(await Customer.update(pool, 1, customerId, {}), false);
});

test("updating a property's street renormalizes it, and a blank city or ZIP becomes NULL", async () => {
    await Property.update(pool, 1, propertyId, { city: "", zip: "83440" });
    let property = await Property.findById(pool, 1, propertyId);
    assert.deepStrictEqual([property.city, property.zip, property.street], [null, "83440", "12 Oak Street"]);

    await Property.update(pool, 1, propertyId, { street: "99 Elm Avenue", city: "Rexburg" });
    property = await Property.findById(pool, 1, propertyId);
    assert.deepStrictEqual([property.street, property.city], ["99 Elm Avenue", "Rexburg"]);
    const found = await Customer.findByContact(pool, 1, { name: "Ann Lee", phone: "208-555-0101", address: "99 elm ave" });
    assert.strictEqual(found.property_id, propertyId);
    assert.strictEqual(await Property.update(pool, 1, propertyId, {}), false);
});

test("a joint name matches however it is spelled, and a rental note does not change who the customer is", async () => {
    const coupleId = await Customer.create(pool, 1, { name: "Sam & Ruth Example", phone: "(208) 555-0111" });
    await Property.create(pool, coupleId, { street: "5 Elm Street", city: "Rexburg" });
    const renterId = await Customer.create(pool, 1, { name: "Nina Sample (rental)", phone: "(208) 555-0122" });
    await Property.create(pool, renterId, { street: "7 Elm Street", city: "Rexburg" });

    const couple = await Customer.findByContact(pool, 1, {
        name: "sam AND ruth example", phone: "208-555-0111", address: "5 elm st",
    });
    assert.strictEqual(couple.customer_id, coupleId);
    const renter = await Customer.findByContact(pool, 1, {
        name: "Nina Sample", phone: "208-555-0122", address: "7 elm st",
    });
    assert.strictEqual(renter.customer_id, renterId);
    assert.strictEqual((await Customer.findById(pool, 1, renterId)).name, "Nina Sample (rental)");

    const results = await Customer.search(pool, 1, "Sam & Ruth");
    assert.deepStrictEqual(results.map((row) => { return row.id; }), [coupleId]);
});

test("updating a name recomputes the key with the person-name rules", async () => {
    await Customer.update(pool, 1, customerId, { name: "Ann O'Lee-Smith" });
    const { rows } = await pool.query("SELECT name_normalized FROM customers WHERE id = $1", [customerId]);
    assert.strictEqual(rows[0].name_normalized, "ann olee smith");
});
