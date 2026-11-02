import crypto from "node:crypto";
import { normalizeAddress, normalizeName, normalizePhone } from "../utils/normalize.js";

// Turns classified rows plus the import-wide options into the exact list of things to create.
// Pure: no database and no network, so the same inputs always give the same plan and the same hash.
// A reference to a record is { id } when it is already on file and { key } when this plan creates it.

const MAX_AREA_LENGTH = 100;
const PLAN_VERSION = 1;

function refId(ref) {
    return ref.id === undefined ? `key:${ref.key}` : `id:${ref.id}`;
}

// Why a row is left out. A row that matched an existing property needs no city, because nothing new is made.
function skipReason(row, options) {
    if (row.match.kind === "blocked") {
        return "blocked";
    }

    if (row.match.kind === "flagged") {
        return "flagged";
    }

    const makesProperty = row.match.kind === "new" || row.match.kind === "new_property";
    if (makesProperty && (row.city ?? options.defaultCity) === "") {
        return "missing_city";
    }

    return null;
}

function cityFor(row, options) {
    return row.city ?? (options.defaultCity === "" ? null : options.defaultCity);
}

function areaFor(row) {
    return row.area !== null && row.area.length <= MAX_AREA_LENGTH ? row.area : null;
}

// A new customer is told apart by name and phone. A row with no phone joins a customer with the same name
// on the same street, since the sheet often repeats a person on several dated rows and not every row has a phone.
function newCustomerKeys(live) {
    const byNameAndStreet = new Map();
    const keys = new Map();

    for (const row of live) {
        const phone = row.phone === null ? "" : normalizePhone(row.phone);
        if (row.match.kind === "new" && phone !== "") {
            const key = `${normalizeName(row.name)}|${phone}`;
            keys.set(row.rowNumber, key);
            const spot = `${normalizeName(row.name)}|${normalizeAddress(row.street)}`;
            if (byNameAndStreet.has(spot) === false) {
                byNameAndStreet.set(spot, key);
            }
        }
    }

    for (const row of live) {
        if (row.match.kind === "new" && keys.has(row.rowNumber) === false) {
            const spot = `${normalizeName(row.name)}|${normalizeAddress(row.street)}`;
            keys.set(row.rowNumber, byNameAndStreet.get(spot) ?? `${normalizeName(row.name)}|`);
        }
    }

    return keys;
}

function canonical(value) {
    if (Array.isArray(value)) {
        return value.map(canonical);
    }

    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => {
            return [key, canonical(value[key])];
        }));
    }

    return value;
}

// The hash covers everything the write will do, including the ids of records the rows matched. If the sheet
// changes, or the matched records do, the hash changes and the confirm step refuses to write.
export function hashPlan(plan, context, options) {
    const body = {
        version: PLAN_VERSION,
        context,
        options,
        customers: plan.customers,
        properties: plan.properties,
        areaUpdates: plan.areaUpdates,
        jobs: plan.jobs,
        skipped: plan.skipped,
    };

    return crypto.createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex");
}

// rows: the classified rows from classifyCandidates. options: the parsed import-wide options.
// context: { sheetId, sheetName, seasonYear }.
export function buildPlan(rows, options, context) {
    const skipped = [];
    const live = [];

    for (const row of rows) {
        const reason = skipReason(row, options);
        if (reason === null) {
            live.push(row);
        } else {
            skipped.push({ rowNumber: row.rowNumber, reason });
        }
    }

    const customerKeys = newCustomerKeys(live);
    const customers = new Map();
    const properties = new Map();
    const areaUpdates = new Map();
    const jobs = new Map();
    const summary = { rowsWithoutDate: 0, duplicateJobsInSheet: 0 };

    for (const row of live) {
        const { kind } = row.match;
        let customer;
        let property;

        if (kind === "existing") {
            customer = { id: row.match.customerId };
            property = { id: row.match.propertyId };
        } else {
            if (kind === "new") {
                customer = { key: customerKeys.get(row.rowNumber) };
                if (customers.has(customer.key) === false) {
                    customers.set(customer.key, { key: customer.key, name: row.name, phone: row.phone });
                } else if (customers.get(customer.key).phone === null) {
                    customers.get(customer.key).phone = row.phone;
                }
            } else {
                customer = { id: row.match.customerId };
            }

            property = { key: `${refId(customer)}|${normalizeAddress(row.street)}` };
            const known = properties.get(property.key);
            if (known === undefined) {
                properties.set(property.key, {
                    key: property.key,
                    customer,
                    street: row.street,
                    city: cityFor(row, options),
                    zip: row.zip,
                    area: areaFor(row),
                });
            } else {
                known.city ??= cityFor(row, options);
                known.zip ??= row.zip;
                known.area ??= areaFor(row);
            }
        }

        if (property.id !== undefined && areaFor(row) !== null && areaUpdates.has(property.id) === false) {
            areaUpdates.set(property.id, { propertyId: property.id, area: areaFor(row) });
        }

        if (row.date === null) {
            summary.rowsWithoutDate += 1;
            continue;
        }

        const jobKey = `${refId(property)}|${options.serviceTypeId}|${row.date}`;
        if (jobs.has(jobKey)) {
            summary.duplicateJobsInSheet += 1;
            continue;
        }

        jobs.set(jobKey, {
            property,
            customer,
            date: row.date,
            amountCents: row.amountCents,
            notes: row.notes,
            rowNumber: row.rowNumber,
        });
    }

    const plan = {
        customers: [...customers.values()],
        properties: [...properties.values()],
        areaUpdates: [...areaUpdates.values()],
        jobs: [...jobs.values()],
        skipped,
    };

    return {
        ...plan,
        summary: {
            ...summary,
            customersToCreate: plan.customers.length,
            propertiesToCreate: plan.properties.length,
            jobsToCreate: plan.jobs.length,
            rowsSkipped: skipped.length,
        },
        hash: hashPlan(plan, context, options),
    };
}
