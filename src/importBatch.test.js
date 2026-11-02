import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "./test/db.js";
import * as ImportBatch from "./models/importBatch.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("importbatch");
const pool = db.pool;
const HASH = "a".repeat(64);
const COUNTS = { customersCreated: 3, propertiesCreated: 4, jobsCreated: 5, jobsExisting: 1, rowsSkipped: 2 };

before(() => {
    return db.reset();
});
beforeEach(() => {
    return db.reset();
});
after(() => {
    return db.close();
});

function details(extra = {}) {
    return {
        createdBy: null, sheetId: "sheet-1", sheetName: "Fall", seasonYear: 2025, planHash: HASH, counts: COUNTS, ...extra,
    };
}

test("a batch keeps its counts and who ran it", async () => {
    const user = await User.create(pool, {
        email: "owner@example.com", passwordHash: await hashPassword("longenough"), roleName: "owner",
    });

    const id = await ImportBatch.create(pool, details({ createdBy: user.id }));
    const batch = await ImportBatch.find(pool, id);

    assert.strictEqual(batch.sheet_name, "Fall");
    assert.strictEqual(batch.season_year, 2025);
    assert.strictEqual(batch.created_by_email, "owner@example.com");
    assert.deepStrictEqual(
        [batch.customers_created, batch.properties_created, batch.jobs_created],
        [3, 4, 5],
    );
    assert.deepStrictEqual([batch.jobs_existing, batch.rows_skipped], [1, 2]);
    assert.strictEqual(await ImportBatch.find(pool, id + 1), null);
});

test("a batch survives its user being deleted", async () => {
    const user = await User.create(pool, {
        email: "owner@example.com", passwordHash: await hashPassword("longenough"), roleName: "owner",
    });
    const id = await ImportBatch.create(pool, details({ createdBy: user.id }));

    await pool.query("DELETE FROM users WHERE id = $1", [user.id]);

    assert.strictEqual((await ImportBatch.find(pool, id)).created_by_email, null);
});

test("negative counts and a hash of the wrong length are refused", async () => {
    await assert.rejects(ImportBatch.create(pool, details({ counts: { ...COUNTS, jobsCreated: -1 } })), /check/i);
    await assert.rejects(ImportBatch.create(pool, details({ planHash: "short" })), /check/i);
    await assert.rejects(ImportBatch.create(pool, details({ planHash: "G".repeat(64) })), /check/i);
});

test("saving a mapping twice for one tab updates it, and another tab stays separate", async () => {
    await ImportBatch.saveMapping(pool, {
        sheetId: "sheet-1", sheetName: "Fall", headerRow: 1, columns: { name: 0, street: 2 }, options: { status: "Completed" },
    });
    await ImportBatch.saveMapping(pool, {
        sheetId: "sheet-1", sheetName: "Fall", headerRow: 2, columns: { name: 1, street: 3 }, options: { status: "Scheduled" },
    });
    await ImportBatch.saveMapping(pool, {
        sheetId: "sheet-1", sheetName: "Spring", headerRow: 1, columns: { name: 0, street: 1 },
    });

    const fall = await ImportBatch.findMapping(pool, "sheet-1", "Fall");
    assert.deepStrictEqual(fall, { header_row: 2, columns: { name: 1, street: 3 }, options: { status: "Scheduled" } });
    assert.deepStrictEqual((await ImportBatch.findMapping(pool, "sheet-1", "Spring")).options, {});
    assert.strictEqual(await ImportBatch.findMapping(pool, "sheet-1", "Missing"), null);
    assert.strictEqual((await pool.query("SELECT count(*)::int AS n FROM import_mappings")).rows[0].n, 2);
});

test("rows created by a batch point at it, and the pointer is cleared if the batch goes", async () => {
    const batchId = await ImportBatch.create(pool, details());
    const customerId = await Customer.create(pool, { name: "Ada Example", phone: "801-555-0100" });
    const propertyId = await Property.create(pool, customerId, { street: "1 Test St", city: "Testville" });
    await pool.query("UPDATE customers SET import_batch_id = $1 WHERE id = $2", [batchId, customerId]);
    await pool.query("UPDATE properties SET import_batch_id = $1 WHERE id = $2", [batchId, propertyId]);

    await pool.query("DELETE FROM import_batches WHERE id = $1", [batchId]);

    const customer = await pool.query("SELECT import_batch_id FROM customers WHERE id = $1", [customerId]);
    const property = await pool.query("SELECT import_batch_id FROM properties WHERE id = $1", [propertyId]);
    assert.strictEqual(customer.rows[0].import_batch_id, null);
    assert.strictEqual(property.rows[0].import_batch_id, null);
});

test("an area is unique by normalized name and cannot be deleted while a property uses it", async () => {
    const area = await pool.query(
        "INSERT INTO subdivisions (name, name_normalized) VALUES ('Oak Hills', 'oak hills') RETURNING id",
    );
    await assert.rejects(
        pool.query("INSERT INTO subdivisions (name, name_normalized) VALUES ('OAK  HILLS', 'oak hills')"),
        /unique/i,
    );

    const customerId = await Customer.create(pool, { name: "Ada Example" });
    const propertyId = await Property.create(pool, customerId, { street: "1 Test St", city: "Testville" });
    await pool.query("UPDATE properties SET subdivision_id = $1 WHERE id = $2", [area.rows[0].id, propertyId]);

    await assert.rejects(pool.query("DELETE FROM subdivisions WHERE id = $1", [area.rows[0].id]), /foreign key/i);
});

test("a job amount cannot be negative but may be empty", async () => {
    const customerId = await Customer.create(pool, { name: "Ada Example" });
    const propertyId = await Property.create(pool, customerId, { street: "1 Test St", city: "Testville" });
    const insert = (amount) => {
        return pool.query(
            `INSERT INTO service_requests (customer_id, property_id, service_type_id, status_id, preferred_date, amount_cents)
             VALUES ($1, $2, 1, 1, '2025-10-14', $3)`,
            [customerId, propertyId, amount],
        );
    };

    await insert(null);
    await insert(0);
    await insert(4500);
    await assert.rejects(insert(-1), /check/i);
});
