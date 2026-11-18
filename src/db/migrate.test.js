import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { mkdtemp, writeFile, rm, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTestDatabaseUrl } from "../config/testDatabase.js";
import { createPool } from "./pool.js";
import { runMigrations } from "./migrate.js";

const realMigrations = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");
const url = getTestDatabaseUrl();
const schema = `test_${process.pid}`;
let admin;
let pool;

before(async () => {
    admin = createPool(url);
    pool = createPool(url, { options: `-c search_path=${schema}` });
});

beforeEach(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
});

after(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
    await admin.end();
});

async function tempDir(files) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "migrations-"));
    for (const [name, sql] of Object.entries(files)) {
        await writeFile(path.join(dir, name), sql);
    }
    return dir;
}

test("applies the real migrations in order and records them", async () => {
    const applied = await runMigrations(pool, realMigrations);
    assert.deepStrictEqual(applied, [
        "001_create_roles.sql",
        "002_create_users.sql",
        "003_create_session_table.sql",
        "004_create_customers.sql",
        "005_create_properties.sql",
        "006_create_service_types.sql",
        "007_create_request_statuses.sql",
        "008_create_service_requests.sql",
        "009_create_status_history.sql",
        "010_create_access_links.sql",
        "011_users_password_optional.sql",
        "012_add_scheduled_date.sql",
        "013_create_reviews.sql",
        "014_create_contact_messages.sql",
        "015_add_referred_by.sql",
        "016_create_import_tables.sql", "017_allow_property_without_city.sql",
        "018_create_area_days.sql",
        "019_create_link_batches.sql",
        "020_add_property_location.sql",
        "021_create_routes.sql",
        "022_create_settings_and_tentative.sql",
        "023_add_area_city.sql",
        "024_create_messenger_batches.sql",
        "025_create_leads.sql",
        "026_drop_request_contact_columns.sql",
        "027_leads_go_with_their_customer.sql",
        "028_create_companies.sql",
    ]);

    const roles = await pool.query("SELECT name FROM roles ORDER BY id");
    assert.deepStrictEqual(roles.rows.map((row) => {
        return row.name;
    }), ["owner", "dispatcher", "customer"]);
});

test("a second run applies nothing", async () => {
    await runMigrations(pool, realMigrations);
    assert.deepStrictEqual(await runMigrations(pool, realMigrations), []);
});

test("a failing file rolls back and is not recorded", async () => {
    const dir = await tempDir({
        "001_good.sql": "CREATE TABLE good (id INT);",
        "002_bad.sql": "CREATE TABLE half (id INT); SELECT * FROM missing_table;",
    });

    try {
        await assert.rejects(runMigrations(pool, dir), /002_bad\.sql failed/);
        const recorded = await pool.query("SELECT name FROM schema_migrations");
        assert.deepStrictEqual(recorded.rows.map((row) => {
            return row.name;
        }), ["001_good.sql"]);
        const half = await pool.query("SELECT to_regclass('half') AS found");
        assert.strictEqual(half.rows[0].found, null);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test("rejects a badly named file", async () => {
    const dir = await tempDir({ "create_things.sql": "SELECT 1;" });

    try {
        await assert.rejects(runMigrations(pool, dir), /must look like/);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test("rejects a missing directory", async () => {
    await assert.rejects(runMigrations(pool, "/no/such/dir"));
});

test("a user cannot reference a role that does not exist", async () => {
    await runMigrations(pool, realMigrations);
    await assert.rejects(
        pool.query("INSERT INTO users (email, password_hash, role_id) VALUES ('a@b.c', 'x', 999)"),
        /foreign key/,
    );
});

// Migrations up to a name, copied to a temp folder, so a test can add rows first and then apply the later ones.
async function migrationsBefore(lastName) {
    const files = {};

    for (const name of (await readdir(realMigrations)).sort()) {
        if (name <= lastName) {
            files[name] = await readFile(path.join(realMigrations, name), "utf8");
        }
    }

    return tempDir(files);
}

test("028 puts every row that already exists in company 1 and makes the next company 2", async () => {
    const before = await migrationsBefore("027_leads_go_with_their_customer.sql");

    try {
        await runMigrations(pool, before);
        await pool.query("INSERT INTO users (email, password_hash, role_id) VALUES ('o@example.com', 'x', 1)");
        const customer = await pool.query(
            "INSERT INTO customers (name, name_normalized, phone, phone_normalized) VALUES ('Pat', 'pat', '208', '208') RETURNING id",
        );
        const property = await pool.query(
            "INSERT INTO properties (customer_id, street, city, address_normalized) VALUES ($1, '1 Main St', 'Rexburg', '1 main st') RETURNING id",
            [customer.rows[0].id],
        );
        await pool.query(
            `INSERT INTO service_requests (customer_id, property_id, service_type_id, status_id, preferred_date)
             VALUES ($1, $2, 1, 1, '2026-10-20')`,
            [customer.rows[0].id, property.rows[0].id],
        );
        await pool.query(
            `INSERT INTO leads (name, name_normalized, phone, phone_normalized, address, address_normalized)
             VALUES ('Sam', 'sam', '208', '208', '2 Oak St', '2 oak st')`,
        );
        await pool.query("INSERT INTO subdivisions (name, name_normalized) VALUES ('Oak Park', 'oak park')");
        await pool.query("INSERT INTO app_settings (key, value) VALUES ('allow_tentative_booking', 'on')");
        await pool.query("INSERT INTO contact_messages (name, email, message) VALUES ('A', 'a@example.com', 'Hi')");

        assert.deepStrictEqual(await runMigrations(pool, realMigrations), ["028_create_companies.sql"]);

        const first = await pool.query("SELECT id, name, slug FROM companies");
        assert.deepStrictEqual(first.rows, [{ id: 1, name: "Tuft Sprinkler Blowouts", slug: "tuft-sprinkler-blowouts" }]);

        for (const table of ["users", "customers", "leads", "subdivisions", "service_requests", "app_settings", "contact_messages"]) {
            const { rows } = await pool.query(`SELECT company_id FROM ${table}`);
            assert.ok(rows.length > 0, `${table} lost its rows`);
            assert.ok(rows.every((row) => {
                return row.company_id === 1;
            }), `${table} has a row outside company 1`);
        }

        const next = await pool.query("INSERT INTO companies (name, slug) VALUES ('Second Co', 'second-co') RETURNING id");
        assert.strictEqual(next.rows[0].id, 2);
    } finally {
        await rm(before, { recursive: true });
    }
});

test("a row without a company_id goes to company 1, so code from before 028 still works during a deploy", async () => {
    await runMigrations(pool, realMigrations);
    const { rows } = await pool.query(
        "INSERT INTO customers (name, name_normalized) VALUES ('Lee', 'lee') RETURNING company_id",
    );

    assert.strictEqual(rows[0].company_id, 1);
});

test("a company id that does not exist is refused, and a company that has data cannot be deleted", async () => {
    await runMigrations(pool, realMigrations);

    await assert.rejects(
        pool.query("INSERT INTO customers (name, name_normalized, company_id) VALUES ('Lee', 'lee', 99)"),
        /foreign key/,
    );
    await pool.query("INSERT INTO customers (name, name_normalized) VALUES ('Lee', 'lee')");
    await assert.rejects(pool.query("DELETE FROM companies WHERE id = 1"), /foreign key/);
});

test("a company slug must be lower-case words joined by hyphens, and each slug is used once", async () => {
    await runMigrations(pool, realMigrations);

    for (const slug of ["Has Caps", "-lead", "trail-", "two--hyphens", "under_score", ""]) {
        await assert.rejects(
            pool.query("INSERT INTO companies (name, slug) VALUES ('X', $1)", [slug]),
            /check constraint/,
            `slug ${JSON.stringify(slug)} was accepted`,
        );
    }

    await pool.query("INSERT INTO companies (name, slug) VALUES ('Second', 'second-co')");
    await assert.rejects(pool.query("INSERT INTO companies (name, slug) VALUES ('Again', 'second-co')"), /unique/);
});
