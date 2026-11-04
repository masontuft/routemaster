import { withTransaction } from "../db/transaction.js";
import { normalizePhone } from "../utils/normalize.js";
import * as AccessLink from "./accessLink.js";

export const MAX_BATCH = 500;
export const MAX_DAYS = 120;

// Customers with a property in the area, each once however many properties they have there, and whether they
// already hold a link that still works (not revoked, not expired). areaId null means every customer with a property.
async function customersInArea(db, areaId) {
    const { rows } = await db.query(
        `SELECT customers.id, customers.name, customers.phone,
                EXISTS (SELECT 1 FROM access_links
                        WHERE access_links.customer_id = customers.id
                          AND access_links.revoked_at IS NULL AND access_links.expires_at > now()) AS has_active
         FROM customers
         WHERE EXISTS (SELECT 1 FROM properties
                       WHERE properties.customer_id = customers.id
                         AND ($1::int IS NULL OR properties.subdivision_id = $1::int))
         ORDER BY customers.name, customers.id`,
        [areaId],
    );
    return rows;
}

// A phone that cannot be texted (blank, or fewer than 10 digits) is listed, not linked.
function textable(customer) {
    return normalizePhone(customer.phone ?? "").length >= 10;
}

function sort(customers, includeActive) {
    const noPhone = customers.filter((customer) => {
        return !textable(customer);
    });
    const withPhone = customers.filter(textable);
    const skippedActive = includeActive ? [] : withPhone.filter((customer) => {
        return customer.has_active;
    });
    const toLink = withPhone.filter((customer) => {
        return includeActive || !customer.has_active;
    });
    return { toLink, noPhone, skippedActive };
}

// With a list of ids, only those customers; an id that is not in the area is ignored, so a forged form cannot reach
// a customer outside it. Without a list, everyone in the area.
function limitTo(customers, customerIds) {
    if (!customerIds) {
        return customers;
    }

    const wanted = new Set(customerIds);
    return customers.filter((customer) => {
        return wanted.has(customer.id);
    });
}

// What a batch would do, without creating anything. null for an area that does not exist.
export async function preview(pool, areaId, { includeActive = false } = {}) {
    const { rows } = await pool.query("SELECT 1 FROM subdivisions WHERE id = $1", [areaId]);

    if (rows.length === 0) {
        return null;
    }

    const { toLink, noPhone, skippedActive } = sort(await customersInArea(pool, areaId), includeActive);
    return { toLink: toLink.length, noPhone: noPhone.length, skippedActive: skippedActive.length };
}

// Makes one link per eligible customer in one transaction, so a failure leaves no half-made batch. The area row is
// locked so two runs for the same area cannot both see "no active link" and double up. The raw tokens are returned
// here and nowhere else; only their hashes are stored.
export async function create(pool, { areaId, createdBy, days, includeActive = false, customerIds = null }) {
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
        throw new RangeError(`days must be a whole number from 1 to ${MAX_DAYS}`);
    }

    return withTransaction(pool, async (client) => {
        // An area's row is locked so two runs for it cannot double up. With no area (every customer) there is no row
        // to lock, so a transaction advisory lock does the same job, and is released when the transaction ends.
        if (areaId === null) {
            await client.query("SELECT pg_advisory_xact_lock(hashtext('link_batch_all_areas'))");
        } else {
            const area = await client.query("SELECT id FROM subdivisions WHERE id = $1 FOR UPDATE", [areaId]);

            if (area.rows.length === 0) {
                return { error: "not_found" };
            }
        }

        const inArea = await customersInArea(client, areaId);
        const { toLink, noPhone, skippedActive } = sort(limitTo(inArea, customerIds), includeActive);

        if (toLink.length > MAX_BATCH) {
            return { error: "too_many", count: toLink.length };
        }

        const batch = await client.query(
            `INSERT INTO link_batches (subdivision_id, created_by, days, links_created, skipped_no_phone, skipped_active)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [areaId, createdBy ?? null, days, toLink.length, noPhone.length, skippedActive.length],
        );
        const batchId = batch.rows[0].id;
        const rows = [];

        for (const customer of toLink) {
            const token = await AccessLink.create(client, { customerId: customer.id, createdBy, days, batchId });
            rows.push({ customerId: customer.id, name: customer.name, phone: customer.phone, token });
        }

        return {
            batchId, rows, skippedActive: skippedActive.length,
            noPhone: noPhone.map((customer) => {
                return { id: customer.id, name: customer.name };
            }),
        };
    });
}
