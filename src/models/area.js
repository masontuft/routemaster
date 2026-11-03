import { normalizeName } from "../utils/normalize.js";

// An area is a row of subdivisions. The import creates them from a sheet's area column; staff create and rename
// them here. days are 'YYYY-MM-DD' strings (to_char), so no time zone can shift a date.

export async function list(pool, today) {
    const { rows } = await pool.query(
        `SELECT subdivisions.id, subdivisions.name,
                (SELECT count(*)::int FROM properties WHERE properties.subdivision_id = subdivisions.id) AS properties,
                (SELECT count(*)::int FROM area_days
                  WHERE area_days.subdivision_id = subdivisions.id AND area_days.day >= $1::date) AS upcoming_days
         FROM subdivisions
         ORDER BY subdivisions.name, subdivisions.id`,
        [today],
    );
    return rows;
}

export async function find(pool, id) {
    const { rows } = await pool.query("SELECT id, name FROM subdivisions WHERE id = $1", [id]);
    return rows[0] ?? null;
}

// Returns the new id, or null when an area with that name (ignoring case and punctuation) already exists.
export async function create(pool, name) {
    const { rows } = await pool.query(
        `INSERT INTO subdivisions (name, name_normalized) VALUES ($1, $2)
         ON CONFLICT (name_normalized) DO NOTHING RETURNING id`,
        [name, normalizeName(name)],
    );
    return rows[0]?.id ?? null;
}

// False when the name belongs to a different area (or there is no such area).
export async function rename(pool, id, name) {
    const normalized = normalizeName(name);
    const result = await pool.query(
        `UPDATE subdivisions SET name = $2, name_normalized = $3
         WHERE id = $1
           AND NOT EXISTS (SELECT 1 FROM subdivisions other WHERE other.name_normalized = $3 AND other.id <> $1)`,
        [id, name, normalized],
    );
    return result.rowCount === 1;
}

export async function upcomingDays(pool, id, today) {
    const { rows } = await pool.query(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM area_days
         WHERE subdivision_id = $1 AND day >= $2::date ORDER BY day`,
        [id, today],
    );
    return rows.map((row) => {
        return row.day;
    });
}

// days: 'YYYY-MM-DD' strings already validated. A day that is already there is left alone.
export async function addDays(pool, id, days) {
    const result = await pool.query(
        `INSERT INTO area_days (subdivision_id, day)
         SELECT $1, unnest($2::date[]) ON CONFLICT DO NOTHING`,
        [id, days],
    );
    return result.rowCount;
}

export async function removeDay(pool, id, day) {
    const result = await pool.query("DELETE FROM area_days WHERE subdivision_id = $1 AND day = $2::date", [id, day]);
    return result.rowCount === 1;
}
