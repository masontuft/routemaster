import { generateToken, hashToken } from "../utils/token.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Returns the raw token once. Only its hash is stored.
export async function create(pool, { customerId, createdBy = null, days = 30 }) {
    const token = generateToken();
    await pool.query(
        "INSERT INTO access_links (customer_id, token_hash, expires_at, created_by) VALUES ($1, $2, $3, $4)",
        [customerId, hashToken(token), new Date(Date.now() + days * DAY_MS), createdBy],
    );
    return token;
}

export async function findValid(pool, token) {
    const { rows } = await pool.query(
        `SELECT id, customer_id FROM access_links
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
        [hashToken(String(token))],
    );
    return rows[0] ? { id: rows[0].id, customerId: rows[0].customer_id } : null;
}

export async function revoke(pool, id) {
    await pool.query("UPDATE access_links SET revoked_at = now() WHERE id = $1", [id]);
}
