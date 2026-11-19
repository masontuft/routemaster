// A message belongs to a company (ADR 0018). The public form has no company in its address yet, so the caller gives the
// first company; staff see, open and answer only their own company's messages.
export async function create(pool, companyId, { name, email, phone, message }) {
    await pool.query(
        "INSERT INTO contact_messages (name, email, phone, message, company_id) VALUES ($1, $2, $3, $4, $5)",
        [name, email, phone || null, message, companyId],
    );
}

export async function list(pool, companyId) {
    const { rows } = await pool.query(
        `SELECT id, name, email, status, to_char(created_at, 'YYYY-MM-DD') AS created
         FROM contact_messages WHERE company_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200`,
        [companyId],
    );
    return rows;
}

export async function countNew(pool, companyId) {
    const { rows } = await pool.query(
        "SELECT count(*)::int AS total FROM contact_messages WHERE status = 'New' AND company_id = $1",
        [companyId],
    );
    return rows[0].total;
}

export async function find(pool, companyId, id) {
    const { rows } = await pool.query(
        `SELECT contact_messages.id, contact_messages.name, contact_messages.email, contact_messages.phone,
                contact_messages.message, contact_messages.status, contact_messages.reply_note,
                to_char(contact_messages.created_at, 'YYYY-MM-DD') AS created, users.email AS replied_by_email
         FROM contact_messages LEFT JOIN users ON users.id = contact_messages.replied_by
         WHERE contact_messages.id = $1 AND contact_messages.company_id = $2`,
        [id, companyId],
    );
    return rows[0] ?? null;
}

// Records that staff answered. The note is a record only; nothing is sent.
export async function reply(pool, companyId, id, note, userId) {
    const { rowCount } = await pool.query(
        `UPDATE contact_messages SET status = 'Replied', reply_note = $2, replied_by = $3, replied_at = now()
         WHERE id = $1 AND company_id = $4`,
        [id, note, userId, companyId],
    );
    return rowCount === 1;
}
