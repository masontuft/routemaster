import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "../test/db.js";
import * as Customer from "../models/customer.js";
import * as Property from "../models/property.js";
import * as ImportBatch from "../models/importBatch.js";
import * as Staff from "../models/staff.js";
import * as User from "../models/user.js";
import { hashPassword } from "../utils/password.js";
import { classifyCandidates } from "./matching.js";
import { buildPlan } from "./plan.js";
import { applyImport } from "./apply.js";

const db = testDb("importapply");
const pool = db.pool;
const CONTEXT = { sheetId: "sheet-1", sheetName: "Fall", seasonYear: 2025 };
const OPTIONS = { serviceTypeId: 1, statusName: "Completed", defaultCity: "" };
const MAPPING = { sheetId: "sheet-1", sheetName: "Fall", headerRow: 1, columns: { name: 0, street: 2 } };
let userId;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    const user = await User.create(pool, {
        email: "owner@example.com", passwordHash: await hashPassword("longenough"), roleName: "owner",
    });
    userId = user.id;
});
after(() => {
    return db.close();
});

function candidate(rowNumber, fields = {}) {
    return {
        rowNumber,
        name: "Ada Example",
        phone: "801-555-0100",
        street: "1 Test Street",
        city: "Testville",
        zip: null,
        date: "2025-10-14",
        amountCents: null,
        area: null,
        notes: null,
        issues: [],
        blocked: false,
        ...fields,
    };
}

function computeWith(candidates, options = OPTIONS) {
    return async (client) => {
        const { rows } = await classifyCandidates(client, candidates);
        return buildPlan(rows, options, CONTEXT);
    };
}

async function runImport(candidates, { options = OPTIONS, hash, target = pool } = {}) {
    const computePlan = computeWith(candidates, options);
    const postedHash = hash ?? (await computePlan(pool)).hash;
    return applyImport(target, { postedHash, computePlan, context: CONTEXT, options, mapping: MAPPING, userId });
}

async function count(table) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
}

async function totals() {
    return {
        customers: await count("customers"),
        properties: await count("properties"),
        jobs: await count("service_requests"),
        history: await count("status_history"),
        batches: await count("import_batches"),
        mappings: await count("import_mappings"),
        areas: await count("subdivisions"),
    };
}

const SEASON = [
    candidate(2, { amountCents: 4500, notes: "back yard", zip: "84601", area: "Oak Hills" }),
    candidate(3, { date: "2025-10-21" }),
    candidate(4, { name: "Bob New", phone: null, street: "2 Test St", date: null }),
];

test("an import writes customers, properties and dated jobs, all pointing at the batch", async () => {
    const { batchId, counts } = await runImport(SEASON);

    assert.deepStrictEqual(counts, {
        customersCreated: 2, propertiesCreated: 2, jobsCreated: 2, jobsExisting: 0, rowsSkipped: 0,
    });
    assert.deepStrictEqual(await totals(), {
        customers: 2, properties: 2, jobs: 2, history: 2, batches: 1, mappings: 1, areas: 1,
    });

    const customer = (await pool.query("SELECT * FROM customers WHERE name = 'Ada Example'")).rows[0];
    assert.strictEqual(customer.name_normalized, "ada example");
    assert.strictEqual(customer.phone_normalized, "8015550100");
    assert.strictEqual(customer.user_id, null);
    assert.strictEqual(customer.import_batch_id, batchId);

    const property = (await pool.query(
        `SELECT properties.*, subdivisions.name AS area FROM properties
         LEFT JOIN subdivisions ON subdivisions.id = properties.subdivision_id WHERE street = '1 Test Street'`,
    )).rows[0];
    assert.strictEqual(property.address_normalized, "1 test st");
    assert.deepStrictEqual([property.city, property.zip, property.area, property.import_batch_id], ["Testville", "84601", "Oak Hills", batchId]);

    const jobs = (await pool.query(
        `SELECT to_char(preferred_date, 'YYYY-MM-DD') AS preferred, to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS created,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS updated,
                amount_cents, notes, request_statuses.name AS status, service_requests.import_batch_id AS batch
         FROM service_requests JOIN request_statuses ON request_statuses.id = service_requests.status_id
         ORDER BY preferred_date`,
    )).rows;
    assert.deepStrictEqual(jobs[0], {
        preferred: "2025-10-14", scheduled: "2025-10-14", created: "2025-10-14 12:00", updated: "2025-10-14 12:00",
        amount_cents: 4500, notes: "back yard", status: "Completed", batch: batchId,
    });
    assert.strictEqual(jobs[1].amount_cents, null);

    const history = (await pool.query(
        "SELECT note, changed_by, to_char(changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day FROM status_history ORDER BY day",
    )).rows;
    assert.deepStrictEqual(history[0], { note: `Imported from spreadsheet (batch ${batchId})`, changed_by: userId, day: "2025-10-14" });

    const batch = await ImportBatch.find(pool, batchId);
    assert.deepStrictEqual([batch.customers_created, batch.jobs_created, batch.created_by_email], [2, 2, "owner@example.com"]);
    assert.deepStrictEqual((await ImportBatch.findMapping(pool, "sheet-1", "Fall")).columns, { name: 0, street: 2 });
});

test("running the same import again creates nothing new", async () => {
    await runImport(SEASON);
    const before = await totals();

    const { counts } = await runImport(SEASON);

    assert.deepStrictEqual(counts, {
        customersCreated: 0, propertiesCreated: 0, jobsCreated: 0, jobsExisting: 2, rowsSkipped: 0,
    });
    assert.deepStrictEqual(await totals(), { ...before, batches: 2 });
});

test("a preview from before someone else's import is refused and writes nothing", async () => {
    const oldHash = (await computeWith(SEASON)(pool)).hash;
    await runImport(SEASON);
    const before = await totals();

    await assert.rejects(runImport(SEASON, { hash: oldHash }), (error) => {
        return error.code === "stale_plan";
    });
    await assert.rejects(runImport(SEASON, { hash: "not a hash" }), (error) => {
        return error.code === "stale_plan";
    });

    assert.deepStrictEqual(await totals(), before);
});

test("a failure part-way through rolls back everything, including customers already inserted", async () => {
    const before = await totals();

    await assert.rejects(runImport(SEASON, { options: { ...OPTIONS, serviceTypeId: 9999 } }), /foreign key/i);

    assert.deepStrictEqual(await totals(), before);
});

test("the chosen status decides whether a job is booked", async () => {
    const scheduled = await runImport([candidate(2)], { options: { ...OPTIONS, statusName: "Scheduled" } });
    const requested = await runImport(
        [candidate(2, { name: "Bob New", phone: "801-555-0111", street: "2 Test St", date: "2025-10-20" })],
        { options: { ...OPTIONS, statusName: "Requested" } },
    );

    const { rows } = await pool.query(
        `SELECT request_statuses.name AS status, scheduled_date IS NOT NULL AS booked, service_requests.import_batch_id AS batch
         FROM service_requests JOIN request_statuses ON request_statuses.id = service_requests.status_id ORDER BY service_requests.id`,
    );
    assert.deepStrictEqual(rows, [
        { status: "Scheduled", booked: true, batch: scheduled.batchId },
        { status: "Requested", booked: false, batch: requested.batchId },
    ]);
});

test("areas are shared across spellings, and an area already on a property is never overwritten", async () => {
    const elm = (await pool.query("INSERT INTO subdivisions (name, name_normalized) VALUES ('Elm Park', 'elm park') RETURNING id")).rows[0].id;
    const ada = await Customer.create(pool, { name: "Ada Example", phone: "801-555-0100" });
    const adaHome = await Property.create(pool, ada, { street: "1 Test St", city: "Testville" });
    const bob = await Customer.create(pool, { name: "Bob Known", phone: "801-555-0111" });
    const bobHome = await Property.create(pool, bob, { street: "2 Test St", city: "Testville" });
    await pool.query("UPDATE properties SET subdivision_id = $1 WHERE id = $2", [elm, adaHome]);

    await runImport([
        candidate(2, { area: "Oak Hills" }),
        candidate(3, { name: "Bob Known", phone: "801-555-0111", street: "2 Test St", area: "oak  HILLS", date: "2025-10-15" }),
        candidate(4, { name: "Cy New", phone: "801-555-0122", street: "3 Test St", area: "Oak Hills.", date: "2025-10-16" }),
    ]);

    const areas = (await pool.query(
        `SELECT properties.street, properties.subdivision_id AS area FROM properties ORDER BY properties.street`,
    )).rows;
    assert.strictEqual(areas[0].area, elm, "an area already on a property is kept");
    assert.ok(areas[1].area !== elm && areas[1].area === areas[2].area, "three spellings of one area share one row");
    assert.strictEqual(await count("subdivisions"), 2);
    assert.ok(adaHome > 0 && bobHome > 0);
});

test("a known customer at a new street gets a property but not a second customer record", async () => {
    const ada = await Customer.create(pool, { name: "Ada Example", phone: "801-555-0100" });

    await runImport([candidate(2, { street: "9 Elsewhere Ave" })]);

    assert.strictEqual(await count("customers"), 1);
    const { rows } = await pool.query("SELECT customer_id FROM properties");
    assert.deepStrictEqual(rows, [{ customer_id: ada }]);
});

test("a large sheet is written in a handful of statements, not one per row", async () => {
    let statements = 0;
    const counting = {
        query: (...args) => {
            statements += 1;
            return pool.query(...args);
        },
        connect: async () => {
            const client = await pool.connect();
            const query = client.query.bind(client);
            client.query = (...args) => {
                statements += 1;
                return query(...args);
            };
            return client;
        },
    };
    const many = Array.from({ length: 3000 }, (unused, index) => {
        return candidate(index + 2, {
            name: `Person ${index}`,
            phone: `801555${String(index).padStart(4, "0")}`,
            street: `${index + 10} Test St`,
            amountCents: 4500,
        });
    });

    const { counts } = await runImport(many, { target: counting });

    assert.strictEqual(counts.customersCreated, 3000);
    assert.strictEqual(counts.jobsCreated, 3000);
    assert.strictEqual(await count("customers"), 3000);
    assert.strictEqual(await count("status_history"), 3000);
    assert.ok(statements <= 60, `used ${statements} statements`);
});

test("an import of past jobs does not change this month's owner numbers", async () => {
    await runImport(SEASON);

    const stats = await Staff.stats(pool);

    assert.strictEqual(stats.requested_this_month, 0);
    assert.strictEqual(stats.completed_this_month, 0);
    assert.strictEqual(stats.scheduled_cents, 0);
});

test("two imports started together write once: the second finds the data changed and writes nothing", async () => {
    const computePlan = computeWith(SEASON);
    const postedHash = (await computePlan(pool)).hash;
    const start = () => {
        return applyImport(pool, {
            postedHash, computePlan, context: CONTEXT, options: OPTIONS, mapping: MAPPING, userId,
        });
    };

    const results = await Promise.allSettled([start(), start()]);

    assert.deepStrictEqual(results.map((result) => {
        return result.status;
    }).sort(), ["fulfilled", "rejected"]);
    assert.strictEqual(results.find((result) => {
        return result.status === "rejected";
    }).reason.code, "stale_plan");
    assert.strictEqual(await count("customers"), 2);
    assert.strictEqual(await count("import_batches"), 1);
});
