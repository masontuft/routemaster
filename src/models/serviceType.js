export async function listActive(pool) {
    const { rows } = await pool.query(
        "SELECT id, name, price_cents FROM service_types WHERE active ORDER BY id",
    );
    return rows;
}

export async function findActive(pool, id) {
    const { rows } = await pool.query("SELECT id, name FROM service_types WHERE id = $1 AND active", [id]);
    return rows[0] ?? null;
}
