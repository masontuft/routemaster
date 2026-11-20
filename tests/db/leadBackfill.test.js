import { test, before, after } from "node:test";
import assert from "node:assert";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTestDatabaseUrl } from "../../src/config/testDatabase.js";
import { createPool } from "../../src/db/pool.js";
import { runMigrations } from "../../src/db/migrate.js";
import { normalizeAddress, normalizePhone } from "../../src/utils/normalize.js";
import { personKey } from "../../src/utils/personName.js";

// Migration 025 fills `leads` from the contact_* columns that already exist on requests, and 026 then drops those
// columns. These tests build the database as it was at migration 024, add requests, then apply the rest and look at
// the leads. 026's own check (every unmatched request has a lead) also has to pass for the backfill to count.

const migrations = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");
const schema = `leadbackfill_${process.pid}`;
const url = getTestDatabaseUrl();
let admin;
let pool;
let before025;
let through025;

before(async () => {
    admin = createPool(url);
    pool = createPool(url, { options: `-c search_path=${schema}` });
    before025 = await mkdtemp(path.join(os.tmpdir(), "migrations-before-025-"));
    through025 = await mkdtemp(path.join(os.tmpdir(), "migrations-through-025-"));

    for (const name of await readdir(migrations)) {
        if (name < "025") {
            await copyFile(path.join(migrations, name), path.join(before025, name));
        }

        if (name < "026") {
            await copyFile(path.join(migrations, name), path.join(through025, name));
        }
    }
});

after(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
    await admin.end();
    await rm(before025, { recursive: true, force: true });
    await rm(through025, { recursive: true, force: true });
});

async function freshDatabaseAt024() {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runMigrations(pool, before025);
}

async function typedRequest(name, phone, address, createdAt) {
    const { rows } = await pool.query(
        `INSERT INTO service_requests
            (service_type_id, status_id, preferred_date, contact_name, contact_phone, contact_address, created_at)
         SELECT 1, id, '2027-01-15', $1, $2, $3, $4 FROM request_statuses WHERE name = 'Needs Review'
         RETURNING id`,
        [name, phone, address, createdAt],
    );
    return rows[0].id;
}

async function leadOf(requestId) {
    const { rows } = await pool.query(
        `SELECT leads.* FROM service_requests JOIN leads ON leads.id = service_requests.lead_id
         WHERE service_requests.id = $1`,
        [requestId],
    );
    return rows[0] ?? null;
}

test("requests that carry the same typed person and address share one lead, made from the earliest", async () => {
    await freshDatabaseAt024();
    const first = await typedRequest("Sam & Ruth Example", "(801) 555-0101", "12 Oak Street", "2026-10-01");
    const again = await typedRequest("Sam and Ruth  Example", "801-555-0101", "12 oak st.", "2026-10-09");
    const other = await typedRequest("Sam & Ruth Example", "(801) 555-0101", "40 Pine Lane", "2026-10-05");
    await runMigrations(pool, migrations);

    const lead = await leadOf(first);
    assert.strictEqual((await leadOf(again)).id, lead.id);
    assert.notStrictEqual((await leadOf(other)).id, lead.id);
    assert.strictEqual((await pool.query("SELECT count(*)::int AS total FROM leads")).rows[0].total, 2);
    assert.deepStrictEqual([lead.name, lead.phone, lead.address, lead.customer_id],
        ["Sam & Ruth Example", "(801) 555-0101", "12 Oak Street", null]);
});

test("the keys the migration works out equal the ones the JavaScript rules make", async () => {
    await freshDatabaseAt024();
    const typed = [
        ["Sam & Ruth Example", "(801) 555-0101", "12 Oak Street"],
        ["Nina Sample (rental)", "1-801-555-0102", "5 Elm Avenue"],
        ["Pat O'Brien", "801.555.0103", "9 Birch Boulevard, Unit 2"],
        ["Kira Sample/ Milo Demo", "8015550104", "77 Cedar Court"],
        ["Max Sample's rental", "801 555 0105", "3 Maple Circle"],
        ["rental", "801 555 0106", "8 Spruce Place"],
    ];
    const ids = [];

    for (const [name, phone, address] of typed) {
        ids.push(await typedRequest(name, phone, address, "2026-10-01"));
    }

    await runMigrations(pool, migrations);

    for (const id of ids) {
        const lead = await leadOf(id);
        assert.strictEqual(lead.name_normalized, personKey(lead.name), lead.name);
        assert.strictEqual(lead.phone_normalized, normalizePhone(lead.phone), lead.phone);
        assert.strictEqual(lead.address_normalized, normalizeAddress(lead.address), lead.address);
    }
});

test("a request that was already matched keeps its typed details as a lead marked as converted", async () => {
    await freshDatabaseAt024();
    const customer = (await pool.query(
        "INSERT INTO customers (name, name_normalized) VALUES ('Ann Lee', 'ann lee') RETURNING id")).rows[0].id;
    const property = (await pool.query(
        `INSERT INTO properties (customer_id, street, city, address_normalized)
         VALUES ($1, '12 Oak Street', 'Rexburg', '12 oak st') RETURNING id`, [customer])).rows[0].id;
    const matched = await typedRequest("Ann Lee", "208-555-0101", "12 Oak St", "2026-10-01");
    await pool.query(
        `UPDATE service_requests SET customer_id = $2, property_id = $3,
                status_id = (SELECT id FROM request_statuses WHERE name = 'Requested') WHERE id = $1`,
        [matched, customer, property],
    );
    await runMigrations(pool, migrations);

    assert.strictEqual((await leadOf(matched)).customer_id, customer);
});

test("a request with no typed details gets no lead", async () => {
    await freshDatabaseAt024();
    const customer = (await pool.query(
        "INSERT INTO customers (name, name_normalized) VALUES ('Ann Lee', 'ann lee') RETURNING id")).rows[0].id;
    const property = (await pool.query(
        `INSERT INTO properties (customer_id, street, city, address_normalized)
         VALUES ($1, '12 Oak Street', 'Rexburg', '12 oak st') RETURNING id`, [customer])).rows[0].id;
    const { rows } = await pool.query(
        `INSERT INTO service_requests (customer_id, property_id, service_type_id, status_id, preferred_date)
         SELECT $1, $2, 1, id, '2027-01-15' FROM request_statuses WHERE name = 'Requested' RETURNING id`,
        [customer, property],
    );
    await runMigrations(pool, migrations);

    assert.strictEqual(await leadOf(rows[0].id), null);
    assert.strictEqual((await pool.query("SELECT count(*)::int AS total FROM leads")).rows[0].total, 0);
});

test("dropping the contact columns refuses to run while an unmatched request has no lead", async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runMigrations(pool, through025);
    // Typed details with no lead: the state a backfill that missed a row would leave.
    await typedRequest("Missed Row", "801-555-0107", "1 Gap Road", "2026-10-01");

    await assert.rejects(runMigrations(pool, migrations), (error) => {
        return error.message.includes("026_drop_request_contact_columns.sql")
            && error.cause.constraint === "service_requests_matched_or_unmatched";
    });
    const columns = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'service_requests' AND column_name = 'contact_name'`, [schema]);
    assert.strictEqual(columns.rowCount, 1);
});
