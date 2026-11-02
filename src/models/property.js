import { normalizeAddress } from "../utils/normalize.js";

export async function create(pool, customerId, { street, city, zip, notes }) {
    const { rows } = await pool.query(
        `INSERT INTO properties (customer_id, street, city, zip, address_normalized, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [customerId, street, city, zip || null, normalizeAddress(street), notes || null],
    );
    return rows[0].id;
}

export async function listForCustomer(pool, customerId) {
    const { rows } = await pool.query(
        "SELECT id, street, city, zip FROM properties WHERE customer_id = $1 ORDER BY id",
        [customerId],
    );
    return rows;
}

export async function findForCustomer(pool, id, customerId) {
    const { rows } = await pool.query(
        "SELECT id, street, city, zip FROM properties WHERE id = $1 AND customer_id = $2",
        [id, customerId],
    );
    return rows[0] ?? null;
}

export async function listForCustomers(pool, customerIds) {
    const { rows } = await pool.query(
        "SELECT id, customer_id, street, city, zip FROM properties WHERE customer_id = ANY($1::int[]) ORDER BY id",
        [customerIds],
    );
    return rows;
}

// Read-only lookup for the import preview: every property on any of these normalized streets, in one query.
export async function listByNormalizedAddresses(pool, addresses) {
    const { rows } = await pool.query(
        `SELECT id, customer_id, address_normalized FROM properties
         WHERE address_normalized = ANY($1::text[]) ORDER BY id`,
        [addresses],
    );
    return rows;
}
