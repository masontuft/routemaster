// Each company has its own catalog (migration 029, ADR 0018), so every function takes the company first.
export async function listActive(pool, companyId) {
    const { rows } = await pool.query(
        "SELECT id, name, price_cents FROM service_types WHERE active AND company_id = $1 ORDER BY id",
        [companyId],
    );
    return rows;
}

export async function findActive(pool, companyId, id) {
    const { rows } = await pool.query(
        "SELECT id, name FROM service_types WHERE id = $1 AND active AND company_id = $2",
        [id, companyId],
    );
    return rows[0] ?? null;
}

const UNIQUE_VIOLATION = "23505";

export async function listAll(pool, companyId) {
    const { rows } = await pool.query(
        "SELECT id, name, price_cents, active FROM service_types WHERE company_id = $1 ORDER BY id",
        [companyId],
    );
    return rows;
}

export async function findById(pool, companyId, id) {
    const { rows } = await pool.query(
        "SELECT id, name, price_cents, active FROM service_types WHERE id = $1 AND company_id = $2",
        [id, companyId],
    );
    return rows[0] ?? null;
}

// Both return { ok: true } or { error: "name_taken" } when the name is already used.
export async function create(pool, companyId, { name, priceCents, active }) {
    try {
        await pool.query(
            "INSERT INTO service_types (name, price_cents, active, company_id) VALUES ($1, $2, $3, $4)",
            [name, priceCents, active, companyId],
        );
        return { ok: true };
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) {
            return { error: "name_taken" };
        }

        throw error;
    }
}

export async function update(pool, companyId, id, { name, priceCents, active }) {
    try {
        await pool.query(
            "UPDATE service_types SET name = $2, price_cents = $3, active = $4 WHERE id = $1 AND company_id = $5",
            [id, name, priceCents, active, companyId],
        );
        return { ok: true };
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) {
            return { error: "name_taken" };
        }

        throw error;
    }
}
