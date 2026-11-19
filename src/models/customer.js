import { withTransaction } from "../db/transaction.js";
import { normalizePhone, normalizeAddress } from "../utils/normalize.js";
import { normalizePersonName, personKey } from "../utils/personName.js";

// Every function here that reads or writes customers takes the company first (ADR 0018). A query that is given
// none sends NULL, which matches no row and which an insert refuses, so a forgotten argument fails and does not leak.
export async function create(pool, companyId, { name, phone, email, userId = null }) {
    const { rows } = await pool.query(
        `INSERT INTO customers (user_id, name, name_normalized, phone, phone_normalized, email, company_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [userId, name, personKey(name), phone ?? null, phone ? normalizePhone(phone) : null, email ?? null, companyId],
    );
    return rows[0].id;
}

export async function findByUserId(pool, userId) {
    const { rows } = await pool.query("SELECT id, name FROM customers WHERE user_id = $1", [userId]);
    return rows[0] ?? null;
}

export async function findById(pool, companyId, id) {
    const { rows } = await pool.query(
        "SELECT id, name, phone, email, user_id FROM customers WHERE id = $1 AND company_id = $2",
        [id, companyId],
    );
    return rows[0] ?? null;
}

// Changes only the fields given: { name, phone, email }. The normalized columns that matching reads are
// recomputed with them, or the customer would stop matching the new spelling. A blank phone or email becomes NULL.
// Column names are fixed strings below; only values are parameters.
export async function update(pool, companyId, id, fields) {
    const values = [id, companyId];
    const sets = [];
    const set = (column, value) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
    };

    if ("name" in fields) {
        set("name", fields.name);
        set("name_normalized", personKey(fields.name));
    }

    if ("phone" in fields) {
        set("phone", fields.phone || null);
        set("phone_normalized", fields.phone ? normalizePhone(fields.phone) : null);
    }

    if ("email" in fields) {
        set("email", fields.email || null);
    }

    if (sets.length === 0) {
        return false;
    }

    const result = await pool.query(`UPDATE customers SET ${sets.join(", ")} WHERE id = $1 AND company_id = $2`, values);
    return result.rowCount === 1;
}

// What deleting a customer takes with it: the foreign keys CASCADE from customers to these four tables.
// Returns null for a customer that does not exist.
export async function countRelated(pool, companyId, id) {
    const { rows } = await pool.query(
        `SELECT customers.id,
                (SELECT count(*)::int FROM properties WHERE customer_id = customers.id) AS properties,
                (SELECT count(*)::int FROM service_requests WHERE customer_id = customers.id)
                + (SELECT count(*)::int FROM service_requests
                   WHERE customer_id IS NULL
                     AND lead_id IN (SELECT id FROM leads WHERE customer_id = customers.id)) AS requests,
                (SELECT count(*)::int FROM leads WHERE customer_id = customers.id) AS leads,
                (SELECT count(*)::int FROM reviews WHERE customer_id = customers.id) AS reviews,
                (SELECT count(*)::int FROM access_links WHERE customer_id = customers.id) AS links
         FROM customers
         WHERE customers.id = $1 AND customers.company_id = $2`,
        [id, companyId],
    );
    return rows[0] ?? null;
}

// Deletes the requests that were never matched but still point at a lead of the customers chosen by `where`. They
// have no customer, so the cascade from customers does not reach them, and they carry the typed details of the
// person being deleted. The leads themselves go with the customers (migration 027). A request that was matched to
// another customer keeps living and only loses its link to the lead. `where` is a fixed string written in this file,
// never user input; the values are parameters.
async function deleteUnmatchedRequestsOfLeads(client, where, params) {
    await client.query(
        `DELETE FROM service_requests
         WHERE customer_id IS NULL
           AND lead_id IN (SELECT leads.id FROM leads JOIN customers ON customers.id = leads.customer_id WHERE ${where})`,
        params,
    );
}

// One transaction, so the customer, their cascade and their leads' leftovers go together or not at all. Returns
// false when there was no such customer.
export async function remove(pool, companyId, id) {
    return withTransaction(pool, async (client) => {
        await deleteUnmatchedRequestsOfLeads(client, "customers.id = $1 AND customers.company_id = $2", [id, companyId]);
        const result = await client.query("DELETE FROM customers WHERE id = $1 AND company_id = $2", [id, companyId]);
        return result.rowCount === 1;
    });
}

// Name, phone and street must all match. Returns the customer and that property, or null.
export async function findByContact(pool, companyId, { name, phone, address }) {
    const { rows } = await pool.query(
        `SELECT customers.id AS customer_id, properties.id AS property_id
         FROM customers
         JOIN properties ON properties.customer_id = customers.id
         WHERE customers.name_normalized = $1
           AND customers.phone_normalized = $2
           AND properties.address_normalized = $3
           AND customers.company_id = $4
         ORDER BY properties.id
         LIMIT 1`,
        [personKey(name), normalizePhone(phone), normalizeAddress(address), companyId],
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
    return create(pool, user.companyId, { name, email: user.email, userId: user.id });
}

// Gets the login for a customer who arrived by link, creating a passwordless one on first use.
export async function ensureUser(pool, customerId) {
    return withTransaction(pool, async (client) => {
        const found = await client.query(
            "SELECT id, name, user_id, company_id FROM customers WHERE id = $1 FOR UPDATE",
            [customerId],
        );
        const customer = found.rows[0];

        if (!customer) {
            return null;
        }

        if (customer.user_id) {
            return { id: customer.user_id, role: "customer", displayName: customer.name, companyId: customer.company_id };
        }

        // The new login belongs to the customer's company, so the session it starts is that company's.
        const created = await client.query(
            "INSERT INTO users (role_id, company_id) SELECT id, $1 FROM roles WHERE name = 'customer' RETURNING id",
            [customer.company_id],
        );
        await client.query("UPDATE customers SET user_id = $1 WHERE id = $2", [created.rows[0].id, customerId]);
        return { id: created.rows[0].id, role: "customer", displayName: customer.name, companyId: customer.company_id };
    });
}

// Normalized search terms contain only letters, digits and spaces, so they cannot carry LIKE wildcards.
// needsCity keeps only customers with a property that has no city. An empty search lists the first 50 customers.
// A phone term needs 3 digits to count.
export async function search(pool, companyId, term, { needsCity = false } = {}) {
    const digits = normalizePhone(term);
    const { rows } = await pool.query(
        `SELECT DISTINCT customers.id, customers.name, customers.phone
         FROM customers
         LEFT JOIN properties ON properties.customer_id = customers.id
         WHERE customers.company_id = $5
           AND (customers.name_normalized LIKE $1
            OR ($2::text IS NOT NULL AND customers.phone_normalized LIKE $2::text)
            OR properties.address_normalized LIKE $3)
           AND ($4::boolean = false OR (properties.id IS NOT NULL AND properties.city IS NULL))
         ORDER BY customers.name, customers.id
         LIMIT 50`,
        [`%${normalizePersonName(term)}%`, digits.length >= 3 ? `%${digits}%` : null, `%${normalizeAddress(term)}%`, needsCity, companyId],
    );
    return rows;
}

// Read-only lookups for the import preview. Each is one query for the whole list.
export async function listNormalizedByIds(pool, companyId, ids) {
    const { rows } = await pool.query(
        "SELECT id, name_normalized, phone_normalized FROM customers WHERE id = ANY($1::int[]) AND company_id = $2",
        [ids, companyId],
    );
    return rows;
}

// pairs: [{ name, phone }] already normalized. Returns customers whose name and phone both match one pair.
export async function listByNamePhonePairs(pool, companyId, pairs) {
    const { rows } = await pool.query(
        `SELECT customers.id, customers.name_normalized, customers.phone_normalized
         FROM customers
         JOIN unnest($1::text[], $2::text[]) AS wanted(name, phone)
           ON customers.name_normalized = wanted.name AND customers.phone_normalized = wanted.phone
         WHERE customers.company_id = $3
         ORDER BY customers.id`,
        [pairs.map((pair) => {
            return pair.name;
        }), pairs.map((pair) => {
            return pair.phone;
        }), companyId],
    );
    return rows;
}

// Bulk delete. batchId null means every customer OF THIS COMPANY, never of the others; a number means the customers
// that import batch created. Properties, requests, history, reviews, links and leads go with them through the CASCADE
// keys. The unmatched requests of those customers' leads go too (see deleteUnmatchedRequestsOfLeads). Other unmatched
// requests, from visitors who never became customers, are not customer data and stay.
// Every count and both deletes carry the company, so one company's "delete all" cannot touch another's rows.
async function countClearScope(client, companyId, batchId) {
    const { rows } = await client.query(
        `SELECT
            (SELECT count(*)::int FROM customers
              WHERE customers.company_id = $2 AND ($1::int IS NULL OR import_batch_id = $1)) AS customers,
            (SELECT count(*)::int FROM properties JOIN customers ON customers.id = properties.customer_id
              WHERE customers.company_id = $2 AND ($1::int IS NULL OR customers.import_batch_id = $1)) AS properties,
            (SELECT count(*)::int FROM service_requests JOIN customers ON customers.id = service_requests.customer_id
              WHERE customers.company_id = $2 AND ($1::int IS NULL OR customers.import_batch_id = $1))
            + (SELECT count(*)::int FROM service_requests
                JOIN leads ON leads.id = service_requests.lead_id
                JOIN customers ON customers.id = leads.customer_id
              WHERE service_requests.customer_id IS NULL AND customers.company_id = $2
                AND ($1::int IS NULL OR customers.import_batch_id = $1)) AS requests,
            (SELECT count(*)::int FROM leads JOIN customers ON customers.id = leads.customer_id
              WHERE customers.company_id = $2 AND ($1::int IS NULL OR customers.import_batch_id = $1)) AS leads,
            (SELECT count(*)::int FROM reviews JOIN customers ON customers.id = reviews.customer_id
              WHERE customers.company_id = $2 AND ($1::int IS NULL OR customers.import_batch_id = $1)) AS reviews,
            (SELECT count(*)::int FROM access_links JOIN customers ON customers.id = access_links.customer_id
              WHERE customers.company_id = $2 AND ($1::int IS NULL OR customers.import_batch_id = $1)) AS links`,
        [batchId, companyId],
    );
    return rows[0];
}

export function countClear(pool, companyId, batchId) {
    return countClearScope(pool, companyId, batchId);
}

// Deletes only if the counts the owner confirmed still hold. The table lock stops a customer or a request from
// being added between the count and the delete, so what was shown is exactly what goes. The lock is on the whole
// table, so two companies' bulk deletes wait for each other. That is slower than needed and not wrong.
export async function clear(pool, companyId, batchId, expected) {
    return withTransaction(pool, async (client) => {
        await client.query("LOCK TABLE customers IN SHARE ROW EXCLUSIVE MODE");
        const counts = await countClearScope(client, companyId, batchId);

        if (Object.keys(counts).some((key) => {
            return counts[key] !== expected[key];
        })) {
            return { deleted: false, counts };
        }

        await deleteUnmatchedRequestsOfLeads(
            client,
            "customers.company_id = $2 AND ($1::int IS NULL OR customers.import_batch_id = $1)",
            [batchId, companyId],
        );
        await client.query(
            "DELETE FROM customers WHERE company_id = $2 AND ($1::int IS NULL OR import_batch_id = $1)",
            [batchId, companyId],
        );
        return { deleted: true, counts };
    });
}
