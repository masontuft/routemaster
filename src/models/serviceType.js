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

const UNIQUE_VIOLATION = "23505";

export async function listAll(pool) {
    const { rows } = await pool.query("SELECT id, name, price_cents, active FROM service_types ORDER BY id");
    return rows;
}

export async function findById(pool, id) {
    const { rows } = await pool.query("SELECT id, name, price_cents, active FROM service_types WHERE id = $1", [id]);
    return rows[0] ?? null;
}

// Both return { ok: true } or { error: "name_taken" } when the name is already used.
export async function create(pool, { name, priceCents, active }) {
    try {
        await pool.query("INSERT INTO service_types (name, price_cents, active) VALUES ($1, $2, $3)", [name, priceCents, active]);
        return { ok: true };
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) {
            return { error: "name_taken" };
        }

        throw error;
    }
}

export async function update(pool, id, { name, priceCents, active }) {
    try {
        await pool.query(
            "UPDATE service_types SET name = $2, price_cents = $3, active = $4 WHERE id = $1",
            [id, name, priceCents, active],
        );
        return { ok: true };
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) {
            return { error: "name_taken" };
        }

        throw error;
    }
}
