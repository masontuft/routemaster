// "Ann Lee" becomes "Ann L." so homeowners are not named in full on a public page.
export function shortName(name) {
    const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : (parts[0] ?? "Customer");
}

// Saves a review only when the request is Completed and belongs to this customer. Creates it, or
// edits the existing one. Returns the review id, or null when the request does not qualify.
export async function save(pool, { requestId, customerId, rating, body }) {
    const { rows } = await pool.query(
        `INSERT INTO reviews (service_request_id, customer_id, rating, body)
         SELECT service_requests.id, service_requests.customer_id, $3, $4
         FROM service_requests
         JOIN request_statuses ON request_statuses.id = service_requests.status_id
         WHERE service_requests.id = $1 AND service_requests.customer_id = $2 AND request_statuses.name = 'Completed'
         ON CONFLICT (service_request_id)
         DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = now()
         RETURNING id`,
        [requestId, customerId, rating, body],
    );
    return rows[0]?.id ?? null;
}

export async function findForRequest(pool, requestId, customerId) {
    const { rows } = await pool.query(
        "SELECT id, rating, body, hidden FROM reviews WHERE service_request_id = $1 AND customer_id = $2",
        [requestId, customerId],
    );
    return rows[0] ?? null;
}

export async function removeOwn(pool, requestId, customerId) {
    const { rowCount } = await pool.query(
        "DELETE FROM reviews WHERE service_request_id = $1 AND customer_id = $2",
        [requestId, customerId],
    );
    return rowCount === 1;
}

// A review has no company of its own: it belongs to a customer, and the customer to a company (ADR 0018). The
// public list, the average and the three staff moderation functions take the company and filter through the customer.
export async function listPublic(pool, companyId) {
    const { rows } = await pool.query(
        `SELECT reviews.id, reviews.rating, reviews.body, customers.name AS customer_name,
                to_char(reviews.created_at, 'YYYY-MM-DD') AS created
         FROM reviews JOIN customers ON customers.id = reviews.customer_id
         WHERE NOT reviews.hidden AND customers.company_id = $1
         ORDER BY reviews.created_at DESC, reviews.id DESC LIMIT 100`,
        [companyId],
    );
    return rows.map((row) => {
        return { ...row, author: shortName(row.customer_name) };
    });
}

export async function averageRating(pool, companyId) {
    const { rows } = await pool.query(
        `SELECT round(avg(reviews.rating), 1)::float AS average, count(*)::int AS total
         FROM reviews JOIN customers ON customers.id = reviews.customer_id
         WHERE NOT reviews.hidden AND customers.company_id = $1`,
        [companyId],
    );
    return rows[0];
}

export async function listAll(pool, companyId) {
    const { rows } = await pool.query(
        `SELECT reviews.id, reviews.rating, reviews.body, reviews.hidden, customers.name AS customer_name,
                to_char(reviews.created_at, 'YYYY-MM-DD') AS created
         FROM reviews JOIN customers ON customers.id = reviews.customer_id
         WHERE customers.company_id = $1
         ORDER BY reviews.created_at DESC, reviews.id DESC LIMIT 200`,
        [companyId],
    );
    return rows;
}

export async function setHidden(pool, companyId, id, hidden) {
    const { rowCount } = await pool.query(
        `UPDATE reviews SET hidden = $2
         WHERE id = $1 AND customer_id IN (SELECT id FROM customers WHERE company_id = $3)`,
        [id, hidden, companyId],
    );
    return rowCount === 1;
}

export async function remove(pool, companyId, id) {
    const { rowCount } = await pool.query(
        "DELETE FROM reviews WHERE id = $1 AND customer_id IN (SELECT id FROM customers WHERE company_id = $2)",
        [id, companyId],
    );
    return rowCount === 1;
}
