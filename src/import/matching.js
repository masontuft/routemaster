import * as Property from "../models/property.js";
import * as Customer from "../models/customer.js";
import { normalizeAddress, normalizeName, normalizePhone } from "../utils/normalize.js";

// What the preview says will happen to a row. Nothing here writes to the database.
//   blocked       missing name or street; never imported
//   flagged       the street belongs to a customer who does not look like this one; the owner decides
//   existing      same customer, same street already on file
//   new_property  customer already on file (name and phone), street is new
//   new           new customer and new property
export const MATCH_KINDS = ["blocked", "flagged", "existing", "new_property", "new"];

function keysFor(candidate) {
    return {
        street: normalizeAddress(candidate.street),
        name: normalizeName(candidate.name),
        phone: candidate.phone === null ? "" : normalizePhone(candidate.phone),
    };
}

// Names must match. Phones only disagree when both sides have one, because the sheet often has none.
function sameCustomer(keys, customer) {
    const phoneConflict = keys.phone !== "" && customer.phone_normalized
        && keys.phone !== customer.phone_normalized;
    return keys.name === customer.name_normalized && !phoneConflict;
}

// The match rule is the same one Customer.findByContact uses for the public form, applied to many rows
// at once: three queries however long the sheet is, not one per row.
async function lookUp(db, keyed) {
    const streets = [...new Set(keyed.map((entry) => {
        return entry.keys.street;
    }))];
    const properties = streets.length > 0 ? await Property.listByNormalizedAddresses(db, streets) : [];

    const byStreet = new Map();
    for (const property of properties) {
        const list = byStreet.get(property.address_normalized) ?? [];
        list.push(property);
        byStreet.set(property.address_normalized, list);
    }

    const ids = [...new Set(properties.map((property) => {
        return property.customer_id;
    }))];
    const owners = new Map();
    for (const customer of ids.length > 0 ? await Customer.listNormalizedByIds(db, ids) : []) {
        owners.set(customer.id, customer);
    }

    // Only rows whose street is unknown can still match an existing customer, and only by name and phone.
    const pairs = keyed.filter((entry) => {
        return byStreet.has(entry.keys.street) === false && entry.keys.phone !== "";
    }).map((entry) => {
        return { name: entry.keys.name, phone: entry.keys.phone };
    });
    const people = new Map();
    for (const customer of pairs.length > 0 ? await Customer.listByNamePhonePairs(db, pairs) : []) {
        const key = `${customer.name_normalized}|${customer.phone_normalized}`;
        if (people.has(key) === false) {
            people.set(key, customer);
        }
    }

    return { byStreet, owners, people };
}

function classify(keys, found) {
    const onStreet = found.byStreet.get(keys.street) ?? [];

    if (onStreet.length > 0) {
        const own = onStreet.find((property) => {
            return sameCustomer(keys, found.owners.get(property.customer_id));
        });

        if (own) {
            return { kind: "existing", customerId: own.customer_id, propertyId: own.id };
        }

        return { kind: "flagged", customerId: onStreet[0].customer_id, propertyId: onStreet[0].id };
    }

    const person = found.people.get(`${keys.name}|${keys.phone}`);
    if (person) {
        return { kind: "new_property", customerId: person.id, propertyId: null };
    }

    return { kind: "new", customerId: null, propertyId: null };
}

// Rows on one street inside the sheet are one property with several jobs. A different name on the same
// street is probably a new tenant or a typo, so it is a warning rather than a silent merge.
function annotateGroups(rows) {
    const groups = new Map();
    for (const row of rows) {
        if (row.match.kind === "blocked") {
            continue;
        }

        const key = normalizeAddress(row.street);
        const group = groups.get(key) ?? [];
        group.push(row);
        groups.set(key, group);
    }

    for (const group of groups.values()) {
        const names = new Set(group.map((row) => {
            return normalizeName(row.name);
        }));

        for (const row of group) {
            row.groupSize = group.length;
            if (names.size > 1) {
                row.issues.push("Other rows on this street have a different name.");
            }
        }
    }

    return groups.size;
}

export async function classifyCandidates(db, candidates) {
    const keyed = candidates.filter((candidate) => {
        return candidate.blocked === false;
    }).map((candidate) => {
        return { candidate, keys: keysFor(candidate) };
    });
    const found = await lookUp(db, keyed);
    const keysByRow = new Map(keyed.map((entry) => {
        return [entry.candidate.rowNumber, entry.keys];
    }));

    const rows = candidates.map((candidate) => {
        const keys = keysByRow.get(candidate.rowNumber);
        const match = keys ? classify(keys, found) : { kind: "blocked", customerId: null, propertyId: null };
        return { ...candidate, issues: [...candidate.issues], groupSize: 0, match };
    });

    const properties = annotateGroups(rows);

    const summary = { total: rows.length, properties, warnings: 0 };
    for (const kind of MATCH_KINDS) {
        summary[kind] = 0;
    }
    for (const row of rows) {
        summary[row.match.kind] += 1;
        if (row.match.kind !== "blocked" && row.issues.length > 0) {
            summary.warnings += 1;
        }
    }

    return { rows, summary };
}
