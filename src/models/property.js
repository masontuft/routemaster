import { normalizeAddress } from "../utils/normalize.js";

export async function create(pool, customerId, { street, city, zip, notes }) {
    const { rows } = await pool.query(
        `INSERT INTO properties (customer_id, street, city, zip, address_normalized, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [customerId, street, city, zip || null, normalizeAddress(street), notes || null],
    );
    return rows[0].id;
}

export async function findById(pool, id) {
    const { rows } = await pool.query(
        "SELECT id, customer_id, street, city, zip, notes, subdivision_id FROM properties WHERE id = $1",
        [id],
    );
    return rows[0] ?? null;
}

// Changes only the fields given: { street, city, zip, notes, subdivisionId }. A new street also gets a new
// normalized address, which the import and the scheduling form match on. A blank city, ZIP, note or area becomes NULL.
export async function update(pool, id, fields) {
    const values = [id];
    const sets = [];
    const set = (column, value) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
    };

    if ("street" in fields) {
        set("street", fields.street);
        set("address_normalized", normalizeAddress(fields.street));
    }

    if ("subdivisionId" in fields) {
        set("subdivision_id", fields.subdivisionId || null);
    }

    for (const column of ["city", "zip", "notes"]) {
        if (column in fields) {
            set(column, fields[column] || null);
        }
    }

    // A different address means the saved point is stale, so it is cleared and looked up again. Saving the same
    // address again keeps the point, because the edit form posts every field each time. Every SET expression sees
    // the old row, so the comparison is between the old address and the new one.
    if (["street", "city", "zip"].some((column) => {
        return column in fields;
    })) {
        const next = ["street", "city", "zip"].map((column) => {
            if (!(column in fields)) {
                return column;
            }

            values.push(column === "street" ? fields.street : fields[column] || null);
            return `$${values.length}::text`;
        });
        const changed = `(street, city, zip) IS DISTINCT FROM (${next.join(", ")})`;
        sets.push(
            `latitude = CASE WHEN ${changed} THEN NULL ELSE latitude END`,
            `longitude = CASE WHEN ${changed} THEN NULL ELSE longitude END`,
            `geocoded_at = CASE WHEN ${changed} THEN NULL ELSE geocoded_at END`,
            `geocode_status = CASE WHEN ${changed} THEN 'pending' ELSE geocode_status END`,
        );
    }

    if (sets.length === 0) {
        return false;
    }

    const result = await pool.query(`UPDATE properties SET ${sets.join(", ")} WHERE id = $1`, values);
    return result.rowCount === 1;
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

// Properties from the given ids that still need a point, oldest first, at most limit of them.
export async function needingLocation(pool, ids, limit) {
    const { rows } = await pool.query(
        `SELECT id, street, city, zip FROM properties
         WHERE id = ANY($1::int[]) AND geocode_status = 'pending'
         ORDER BY id LIMIT $2`,
        [ids, limit],
    );
    return rows;
}

export async function saveLocation(pool, id, { lat, lng }) {
    await pool.query(
        `UPDATE properties SET latitude = $2, longitude = $3, geocode_status = 'ok', geocoded_at = now()
         WHERE id = $1`,
        [id, lat, lng],
    );
}

export async function markLocationFailed(pool, id) {
    await pool.query(
        `UPDATE properties SET latitude = NULL, longitude = NULL, geocode_status = 'failed', geocoded_at = now()
         WHERE id = $1`,
        [id],
    );
}

// Puts failed properties back to pending, for a retry after staff fix the address or a service comes back.
export async function retryFailedLocations(pool, ids) {
    const result = await pool.query(
        `UPDATE properties SET geocode_status = 'pending', geocoded_at = NULL
         WHERE id = ANY($1::int[]) AND geocode_status = 'failed'`,
        [ids],
    );
    return result.rowCount;
}
