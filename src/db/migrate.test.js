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
        "029_company_service_types_and_lead_key.sql",
        "030_requests_keep_to_their_company.sql",
        "031_company_area_route_setting_keys.sql",
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

        assert.deepStrictEqual(await runMigrations(pool, realMigrations), [
            "028_create_companies.sql",
            "029_company_service_types_and_lead_key.sql",
            "030_requests_keep_to_their_company.sql",
            "031_company_area_route_setting_keys.sql",
        ]);

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

test("029 puts the existing service types in company 1, and a name is unique within a company only", async () => {
    const before = await migrationsBefore("028_create_companies.sql");

    try {
        await runMigrations(pool, before);
        assert.deepStrictEqual(await runMigrations(pool, realMigrations), [
            "029_company_service_types_and_lead_key.sql",
            "030_requests_keep_to_their_company.sql",
            "031_company_area_route_setting_keys.sql",
        ]);

        const types = await pool.query("SELECT name, company_id FROM service_types ORDER BY id");
        assert.deepStrictEqual(types.rows, [
            { name: "Sprinkler Blowout", company_id: 1 },
            { name: "Sprinkler Startup", company_id: 1 },
        ]);

        await pool.query("INSERT INTO companies (name, slug) VALUES ('Second Co', 'second-co')");
        await pool.query("INSERT INTO service_types (name, company_id) VALUES ('Sprinkler Blowout', 2)");
        await assert.rejects(
            pool.query("INSERT INTO service_types (name, company_id) VALUES ('Sprinkler Blowout', 2)"),
            /unique/,
        );
        await assert.rejects(
            pool.query("INSERT INTO service_types (name) VALUES ('Sprinkler Blowout')"),
            /unique/,
            "a name already in company 1 is refused in company 1",
        );
    } finally {
        await rm(before, { recursive: true });
    }
});

test("029 keeps the old lead key for the running code and adds the per-company one", async () => {
    await runMigrations(pool, realMigrations);
    await pool.query("INSERT INTO companies (name, slug) VALUES ('Second Co', 'second-co')");
    const lead = (companyId, name = "Sam") => {
        return pool.query(
            `INSERT INTO leads (name, name_normalized, phone, phone_normalized, address, address_normalized, company_id)
             VALUES ($1, 'sam', '208', '208', '2 Oak St', '2 oak st', $2)
             ON CONFLICT (name_normalized, phone_normalized, address_normalized) DO UPDATE SET name = leads.name
             RETURNING id, company_id`,
            [name, companyId],
        );
    };

    const first = await lead(1);
    const again = await lead(1);

    assert.strictEqual(first.rows[0].id, again.rows[0].id, "the old ON CONFLICT target still works");
    await assert.rejects(
        pool.query(
            `INSERT INTO leads (name, name_normalized, phone, phone_normalized, address, address_normalized, company_id)
             VALUES ('Sam', 'sam', '208', '208', '2 Oak St', '2 oak st', 1)`,
        ),
        /unique/,
    );
    const keys = await pool.query(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'leads'::regclass AND contype = 'u' ORDER BY conname",
    );
    assert.ok(keys.rows.some((row) => {
        return row.conname === "leads_company_match_key";
    }));
});

// A company 2, a customer and a lead in each company, and a service type each. Returns the ids.
async function twoCompanies() {
    await runMigrations(pool, realMigrations);
    await pool.query("INSERT INTO companies (name, slug) VALUES ('Second Co', 'second-co')");
    const customer = async (companyId, name) => {
        return (await pool.query(
            "INSERT INTO customers (name, name_normalized, company_id) VALUES ($1, $1, $2) RETURNING id",
            [name, companyId],
        )).rows[0].id;
    };
    const lead = async (companyId, name) => {
        return (await pool.query(
            `INSERT INTO leads (name, name_normalized, phone, phone_normalized, address, address_normalized, company_id)
             VALUES ($1, $1, $1, $1, $1, $1, $2) RETURNING id`,
            [name, companyId],
        )).rows[0].id;
    };
    const property = async (customerId) => {
        return (await pool.query(
            "INSERT INTO properties (customer_id, street, city, address_normalized) VALUES ($1, 'x', 'y', 'x') RETURNING id",
            [customerId],
        )).rows[0].id;
    };
    const ann = await customer(1, "ann");
    const bo = await customer(2, "bo");

    return { ann, bo, annProperty: await property(ann), boProperty: await property(bo), lead1: await lead(1, "l1"), lead2: await lead(2, "l2") };
}

function insertRequest({ customerId = null, propertyId = null, leadId = null, companyId }) {
    return pool.query(
        `INSERT INTO service_requests (customer_id, property_id, lead_id, service_type_id, status_id, preferred_date, company_id)
         VALUES ($1, $2, $3, 1, 1, '2030-01-01', $4) RETURNING id`,
        [customerId, propertyId, leadId, companyId],
    );
}

test("030: a request cannot name a customer or a lead of another company", async () => {
    const ids = await twoCompanies();

    await assert.rejects(
        insertRequest({ customerId: ids.ann, propertyId: ids.annProperty, companyId: 2 }),
        /foreign key/,
        "company 2 request, company 1 customer",
    );
    await assert.rejects(insertRequest({ leadId: ids.lead1, companyId: 2 }), /foreign key|check/, "company 2 request, company 1 lead");
    await insertRequest({ customerId: ids.bo, propertyId: ids.boProperty, companyId: 2 });
    await insertRequest({ customerId: ids.ann, propertyId: ids.annProperty, leadId: ids.lead1, companyId: 1 });
});

test("030: deleting a customer still deletes their requests, and deleting a lead clears only the lead", async () => {
    const ids = await twoCompanies();
    await insertRequest({ customerId: ids.ann, propertyId: ids.annProperty, leadId: ids.lead1, companyId: 1 });
    await insertRequest({ customerId: ids.bo, propertyId: ids.boProperty, companyId: 2 });

    await pool.query("DELETE FROM leads WHERE id = $1", [ids.lead1]);
    const kept = await pool.query("SELECT lead_id, company_id FROM service_requests WHERE customer_id = $1", [ids.ann]);
    assert.deepStrictEqual(kept.rows, [{ lead_id: null, company_id: 1 }]);

    await pool.query("DELETE FROM customers WHERE id = $1", [ids.ann]);
    const left = await pool.query("SELECT customer_id FROM service_requests");
    assert.deepStrictEqual(left.rows, [{ customer_id: ids.bo }]);
});

test("030: a request with no customer and no lead is not checked for either", async () => {
    await twoCompanies();

    // The CHECK on service_requests still wants an unmatched request to have a lead, so this one is refused by that
    // rule and not by the foreign keys: the message is a check violation, not a foreign key violation.
    await assert.rejects(insertRequest({ companyId: 1 }), /check/);
});

test("031 adds the per-company area, route and setting keys and keeps the old ones for the running code", async () => {
    await runMigrations(pool, realMigrations);
    await pool.query("INSERT INTO companies (name, slug) VALUES ('Second Co', 'second-co')");
    const keys = await pool.query(
        `SELECT conname FROM pg_constraint
         WHERE contype = 'u' AND connamespace = current_schema()::regnamespace AND conname IN
               ('subdivisions_company_name_key', 'routes_company_day_key', 'app_settings_company_key_key')
         ORDER BY conname`,
    );
    assert.deepStrictEqual(keys.rows.map((row) => {
        return row.conname;
    }), ["app_settings_company_key_key", "routes_company_day_key", "subdivisions_company_name_key"]);

    // The old conflict targets still work, because the running code names them.
    await pool.query("INSERT INTO subdivisions (name, name_normalized) VALUES ('Oak Park', 'oak park')");
    const again = await pool.query(
        `INSERT INTO subdivisions (name, name_normalized) VALUES ('Oak Park', 'oak park')
         ON CONFLICT (name_normalized) DO NOTHING RETURNING id`,
    );
    assert.strictEqual(again.rowCount, 0);
    await pool.query("INSERT INTO app_settings (key, value) VALUES ('allow_tentative_booking', 'on')");
    await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ('allow_tentative_booking', 'off')
         ON CONFLICT (key) DO UPDATE SET value = 'off'`,
    );

    // The new targets work for the same company.
    const same = await pool.query(
        `INSERT INTO subdivisions (name, name_normalized, company_id) VALUES ('Oak Park', 'oak park', 1)
         ON CONFLICT (company_id, name_normalized) DO NOTHING RETURNING id`,
    );
    assert.strictEqual(same.rowCount, 0);

    // The old global keys still refuse another company until the contract migration (issue 75).
    await assert.rejects(
        pool.query("INSERT INTO subdivisions (name, name_normalized, company_id) VALUES ('Oak Park', 'oak park', 2)"),
        /unique/,
    );
});
