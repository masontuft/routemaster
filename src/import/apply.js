import { withTransaction } from "../db/transaction.js";
import * as ImportBatch from "../models/importBatch.js";
import { SpreadsheetImportError } from "./errors.js";
import { normalizeAddress, normalizeName, normalizePhone } from "../utils/normalize.js";

// Writes a plan. Everything happens in one transaction, so a failure anywhere leaves the database as it was.
// The statements are set-based (a few per thousand rows), because a 20,000-row sheet written one row at a time
// would be tens of thousands of round trips to the database.

// Any fixed number will do: every import takes the same lock, so two imports can never run at once.
const IMPORT_LOCK_KEY = 90210033;
const CHUNK_SIZE = 1000;
const STALE_MESSAGE = "The sheet or the data changed since this preview. Review the preview again.";
const NOON_UTC = "(t.day + time '12:00') AT TIME ZONE 'UTC'";

function chunksOf(list) {
    const groups = [];
    for (let start = 0; start < list.length; start += CHUNK_SIZE) {
        groups.push(list.slice(start, start + CHUNK_SIZE));
    }
    return groups;
}

const SEQUENCE_TABLES = ["customers", "properties", "service_requests"];

// Ids are taken from the table's own sequence first and then written explicitly. That way each new row's id is
// known without depending on the order a multi-row INSERT returns its rows in.
async function allocateIds(client, table, count) {
    if (SEQUENCE_TABLES.includes(table) === false) {
        throw new Error("Unknown table.");
    }

    const { rows } = await client.query(
        `SELECT nextval(pg_get_serial_sequence('${table}', 'id'))::int AS id FROM generate_series(1, $1::int)`,
        [count],
    );
    return rows.map((row) => {
        return row.id;
    });
}

function lookUp(map, ref, what) {
    const id = ref.id ?? map.get(ref.key);
    if (id === undefined) {
        throw new Error(`The plan refers to a ${what} it did not create.`);
    }
    return id;
}

async function writeAreas(client, plan) {
    const names = new Map();
    for (const entry of [...plan.properties, ...plan.areaUpdates]) {
        if (entry.area !== null && names.has(normalizeName(entry.area)) === false) {
            names.set(normalizeName(entry.area), entry.area);
        }
    }

    if (names.size === 0) {
        return new Map();
    }

    await client.query(
        `INSERT INTO subdivisions (name, name_normalized)
         SELECT * FROM unnest($1::text[], $2::text[])
         ON CONFLICT (name_normalized) DO NOTHING`,
        [[...names.values()], [...names.keys()]],
    );
    const { rows } = await client.query(
        "SELECT id, name_normalized FROM subdivisions WHERE name_normalized = ANY($1::text[])",
        [[...names.keys()]],
    );
    return new Map(rows.map((row) => {
        return [row.name_normalized, row.id];
    }));
}

async function writeCustomers(client, plan, batchId) {
    const created = new Map();

    for (const group of chunksOf(plan.customers)) {
        const ids = await allocateIds(client, "customers", group.length);
        const phones = group.map((customer) => {
            return customer.phone === null ? null : normalizePhone(customer.phone) || null;
        });

        await client.query(
            `INSERT INTO customers (id, name, name_normalized, phone, phone_normalized, import_batch_id)
             SELECT t.id, t.name, t.name_normalized, t.phone, t.phone_normalized, $6
             FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[])
                  AS t(id, name, name_normalized, phone, phone_normalized)`,
            [
                ids,
                group.map((customer) => {
                    return customer.name;
                }),
                group.map((customer) => {
                    return normalizeName(customer.name);
                }),
                group.map((customer) => {
                    return customer.phone;
                }),
                phones,
                batchId,
            ],
        );

        group.forEach((customer, index) => {
            created.set(customer.key, ids[index]);
        });
    }

    return created;
}

async function writeProperties(client, plan, customerIds, areaIds, batchId) {
    const created = new Map();

    for (const group of chunksOf(plan.properties)) {
        const ids = await allocateIds(client, "properties", group.length);

        await client.query(
            `INSERT INTO properties
                (id, customer_id, street, city, zip, address_normalized, subdivision_id, import_batch_id)
             SELECT t.id, t.customer_id, t.street, t.city, t.zip, t.address_normalized, t.subdivision_id, $8
             FROM unnest($1::int[], $2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[])
                  AS t(id, customer_id, street, city, zip, address_normalized, subdivision_id)`,
            [
                ids,
                group.map((property) => {
                    return lookUp(customerIds, property.customer, "customer");
                }),
                group.map((property) => {
                    return property.street;
                }),
                group.map((property) => {
                    return property.city;
                }),
                group.map((property) => {
                    return property.zip;
                }),
                group.map((property) => {
                    return normalizeAddress(property.street);
                }),
                group.map((property) => {
                    return property.area === null ? null : areaIds.get(normalizeName(property.area));
                }),
                batchId,
            ],
        );

        group.forEach((property, index) => {
            created.set(property.key, ids[index]);
        });
    }

    return created;
}

// An existing property gets an area only if it has none: what the owner already set is never overwritten.
async function writeAreaUpdates(client, plan, areaIds) {
    for (const group of chunksOf(plan.areaUpdates)) {
        await client.query(
            `UPDATE properties SET subdivision_id = t.subdivision_id
             FROM unnest($1::int[], $2::int[]) AS t(id, subdivision_id)
             WHERE properties.id = t.id AND properties.subdivision_id IS NULL`,
            [
                group.map((update) => {
                    return update.propertyId;
                }),
                group.map((update) => {
                    return areaIds.get(normalizeName(update.area));
                }),
            ],
        );
    }
}

// A job already on file for the same property, service and date is not made again.
async function jobsAlreadyOnFile(client, jobs, propertyIds, options) {
    const known = [...new Set(jobs.map((job) => {
        return job.property.id;
    }).filter((id) => {
        return id !== undefined;
    }))];

    if (known.length === 0) {
        return new Set();
    }

    const { rows } = await client.query(
        `SELECT property_id, to_char(preferred_date, 'YYYY-MM-DD') AS day
         FROM service_requests WHERE property_id = ANY($1::int[]) AND service_type_id = $2`,
        [known, options.serviceTypeId],
    );
    return new Set(rows.map((row) => {
        return `${row.property_id}|${row.day}`;
    }));
}

async function writeJobs(client, plan, ctx) {
    const { propertyIds, customerIds, options, batchId, userId } = ctx;
    const status = await client.query("SELECT id FROM request_statuses WHERE name = $1", [options.statusName]);
    if (status.rows.length === 0) {
        throw new Error("Unknown status.");
    }

    const onFile = await jobsAlreadyOnFile(client, plan.jobs, propertyIds, options);
    const todo = [];
    let existing = 0;

    for (const job of plan.jobs) {
        const propertyId = lookUp(propertyIds, job.property, "property");
        if (onFile.has(`${propertyId}|${job.date}`)) {
            existing += 1;
        } else {
            todo.push({ ...job, propertyId, customerId: lookUp(customerIds, job.customer, "customer") });
        }
    }

    // A past job is dated by when it happened, so the owner's "this month" numbers are not swamped by an import.
    const booked = options.statusName === "Scheduled" || options.statusName === "Completed";
    const note = `Imported from spreadsheet (batch ${batchId})`;

    for (const group of chunksOf(todo)) {
        const ids = await allocateIds(client, "service_requests", group.length);

        await client.query(
            `INSERT INTO service_requests
                (id, customer_id, property_id, service_type_id, status_id, preferred_date, scheduled_date,
                 notes, amount_cents, created_at, updated_at, import_batch_id)
             SELECT t.id, t.customer_id, t.property_id, $6, $7, t.day, CASE WHEN $8 THEN t.day END,
                    t.notes, t.amount_cents, ${NOON_UTC}, ${NOON_UTC}, $9
             FROM unnest($1::int[], $2::int[], $3::int[], $4::date[], $5::text[], $10::int[])
                  AS t(id, customer_id, property_id, day, notes, amount_cents)`,
            [
                ids,
                group.map((job) => {
                    return job.customerId;
                }),
                group.map((job) => {
                    return job.propertyId;
                }),
                group.map((job) => {
                    return job.date;
                }),
                group.map((job) => {
                    return job.notes;
                }),
                options.serviceTypeId,
                status.rows[0].id,
                booked,
                batchId,
                group.map((job) => {
                    return job.amountCents;
                }),
            ],
        );

        await client.query(
            `INSERT INTO status_history (service_request_id, status_id, changed_by, note, changed_at)
             SELECT t.id, $3, $4, $5, ${NOON_UTC}
             FROM unnest($1::int[], $2::date[]) AS t(id, day)`,
            [
                ids,
                group.map((job) => {
                    return job.date;
                }),
                status.rows[0].id,
                userId ?? null,
                note,
            ],
        );
    }

    return { created: todo.length, existing };
}

// computePlan(client) re-reads the sheet's rows and classifies them against the database through the
// transaction's own connection, so the plan that is hashed is the plan that is written. postedHash is the hash
// the owner saw in the preview. mapping is { sheetId, sheetName, headerRow, columns }, remembered for next time.
export async function applyImport(pool, { postedHash, computePlan, context, options, mapping, userId }) {
    return withTransaction(pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock($1)", [IMPORT_LOCK_KEY]);

        const plan = await computePlan(client);
        if (plan.hash !== postedHash) {
            throw new SpreadsheetImportError("stale_plan", STALE_MESSAGE);
        }

        const batchId = await ImportBatch.create(client, {
            createdBy: userId ?? null,
            sheetId: context.sheetId,
            sheetName: context.sheetName,
            seasonYear: context.seasonYear,
            planHash: plan.hash,
            counts: { customersCreated: 0, propertiesCreated: 0, jobsCreated: 0, jobsExisting: 0, rowsSkipped: 0 },
        });

        const areaIds = await writeAreas(client, plan);
        const customerIds = await writeCustomers(client, plan, batchId);
        const propertyIds = await writeProperties(client, plan, customerIds, areaIds, batchId);
        await writeAreaUpdates(client, plan, areaIds);
        const jobs = await writeJobs(client, plan, { propertyIds, customerIds, options, batchId, userId });

        const counts = {
            customersCreated: plan.customers.length,
            propertiesCreated: plan.properties.length,
            jobsCreated: jobs.created,
            jobsExisting: jobs.existing,
            rowsSkipped: plan.skipped.length,
        };
        await ImportBatch.setCounts(client, batchId, counts);
        await ImportBatch.saveMapping(client, {
            ...mapping,
            options: {
                serviceTypeId: options.serviceTypeId,
                statusName: options.statusName,
                defaultCity: options.defaultCity,
            },
        });

        return { batchId, counts };
    });
}
