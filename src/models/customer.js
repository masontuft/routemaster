import { withTransaction } from "../db/transaction.js";
import { normalizeName, normalizePhone, normalizeAddress } from "../utils/normalize.js";

export async function create(pool, { name, phone, email, userId = null }) {
    const { rows } = await pool.query(
        `INSERT INTO customers (user_id, name, name_normalized, phone, phone_normalized, email)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, name, normalizeName(name), phone ?? null, phone ? normalizePhone(phone) : null, email ?? null],
    );
    return rows[0].id;
}

export async function findByUserId(pool, userId) {
    const { rows } = await pool.query("SELECT id, name FROM customers WHERE user_id = $1", [userId]);
    return rows[0] ?? null;
}

export async function findById(pool, id) {
    const { rows } = await pool.query("SELECT id, name, phone, email, user_id FROM customers WHERE id = $1", [id]);
    return rows[0] ?? null;
}

// Name, phone and street must all match. Returns the customer and that property, or null.
export async function findByContact(pool, { name, phone, address }) {
    const { rows } = await pool.query(
        `SELECT customers.id AS customer_id, properties.id AS property_id
         FROM customers
         JOIN properties ON properties.customer_id = customers.id
         WHERE customers.name_normalized = $1
           AND customers.phone_normalized = $2
           AND properties.address_normalized = $3
         ORDER BY properties.id
         LIMIT 1`,
        [normalizeName(name), normalizePhone(phone), normalizeAddress(address)],
    );
    return rows[0] ?? null;
}

// Gets the customer record for a logged-in user, creating a bare one on first use.
export async function ensureForUser(pool, user) {
    const existing = await findByUserId(pool, user.id);

    if (existing) {
        return existing.id;
    }

    const name = user.email ? user.email.split("@")[0] : "Customer";
    return create(pool, { name, email: user.email, userId: user.id });
}

// Gets the login for a customer who arrived by link, creating a passwordless one on first use.
export async function ensureUser(pool, customerId) {
    return withTransaction(pool, async (client) => {
        const found = await client.query("SELECT id, name, user_id FROM customers WHERE id = $1 FOR UPDATE", [customerId]);
        const customer = found.rows[0];

        if (!customer) {
            return null;
        }

        if (customer.user_id) {
            return { id: customer.user_id, role: "customer", displayName: customer.name };
        }

        const created = await client.query(
            "INSERT INTO users (role_id) SELECT id FROM roles WHERE name = 'customer' RETURNING id",
        );
        await client.query("UPDATE customers SET user_id = $1 WHERE id = $2", [created.rows[0].id, customerId]);
        return { id: created.rows[0].id, role: "customer", displayName: customer.name };
    });
}

// Normalized search terms contain only letters, digits and spaces, so they cannot carry LIKE wildcards.
// An empty search lists the first 50 customers. A phone term needs 3 digits to count.
export async function search(pool, term) {
    const digits = normalizePhone(term);
    const { rows } = await pool.query(
        `SELECT DISTINCT customers.id, customers.name, customers.phone
         FROM customers
         LEFT JOIN properties ON properties.customer_id = customers.id
         WHERE customers.name_normalized LIKE $1
            OR ($2::text IS NOT NULL AND customers.phone_normalized LIKE $2::text)
            OR properties.address_normalized LIKE $3
         ORDER BY customers.name, customers.id
         LIMIT 50`,
        [`%${normalizeName(term)}%`, digits.length >= 3 ? `%${digits}%` : null, `%${normalizeAddress(term)}%`],
    );
    return rows;
}
