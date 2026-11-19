import { withTransaction } from "../db/transaction.js";
import { normalizeName } from "../utils/normalize.js";

// An area is a row of subdivisions. The import creates them from a sheet's area column; staff create and rename
// them here. days are 'YYYY-MM-DD' strings (to_char), so no time zone can shift a date.

// Every function here takes the company first (ADR 0018). An area of another company is "not found".
export async function list(pool, companyId, today) {
    const { rows } = await pool.query(
        `SELECT subdivisions.id, subdivisions.name,
                subdivisions.city,
                (SELECT count(*)::int FROM properties WHERE properties.subdivision_id = subdivisions.id) AS properties,
                (SELECT count(*)::int FROM area_days
                  WHERE area_days.subdivision_id = subdivisions.id AND area_days.day >= $1::date) AS upcoming_days
         FROM subdivisions
         WHERE subdivisions.company_id = $2
         ORDER BY subdivisions.name, subdivisions.id`,
        [today, companyId],
    );
    return rows;
}

// The upcoming days of the area a property is in. A property with no area, or an area with no upcoming
// days, gets an empty list.
export async function daysForProperty(pool, companyId, propertyId, today) {
    const { rows } = await pool.query(
        `SELECT to_char(area_days.day, 'YYYY-MM-DD') AS day
         FROM properties
         JOIN subdivisions ON subdivisions.id = properties.subdivision_id AND subdivisions.company_id = $3
         JOIN area_days ON area_days.subdivision_id = subdivisions.id
         WHERE properties.id = $1 AND area_days.day >= $2::date
         ORDER BY area_days.day`,
        [propertyId, today, companyId],
    );
    return rows.map((row) => {
        return row.day;
    });
}

export async function find(pool, companyId, id) {
    const { rows } = await pool.query(
        "SELECT id, name, city FROM subdivisions WHERE id = $1 AND company_id = $2",
        [id, companyId],
    );
    return rows[0] ?? null;
}

// Returns the new id, or null when an area with that name (ignoring case and punctuation) already exists.
export async function create(pool, companyId, name) {
    const { rows } = await pool.query(
        `INSERT INTO subdivisions (name, name_normalized, company_id) VALUES ($1, $2, $3)
         ON CONFLICT (company_id, name_normalized) DO NOTHING RETURNING id`,
        [name, normalizeName(name), companyId],
    );
    return rows[0]?.id ?? null;
}

// False when the name belongs to a different area (or there is no such area).
export async function rename(pool, companyId, id, name) {
    const normalized = normalizeName(name);
    const result = await pool.query(
        `UPDATE subdivisions SET name = $2, name_normalized = $3
         WHERE id = $1 AND company_id = $4
           AND NOT EXISTS (
               SELECT 1 FROM subdivisions other
               WHERE other.name_normalized = $3 AND other.company_id = $4 AND other.id <> $1
           )`,
        [id, name, normalized, companyId],
    );
    return result.rowCount === 1;
}

export async function upcomingDays(pool, companyId, id, today) {
    const { rows } = await pool.query(
        `SELECT to_char(area_days.day, 'YYYY-MM-DD') AS day
         FROM area_days JOIN subdivisions ON subdivisions.id = area_days.subdivision_id
         WHERE area_days.subdivision_id = $1 AND area_days.day >= $2::date AND subdivisions.company_id = $3
         ORDER BY area_days.day`,
        [id, today, companyId],
    );
    return rows.map((row) => {
        return row.day;
    });
}

// days: 'YYYY-MM-DD' strings already validated. A day that is already there is left alone.
export async function addDays(pool, companyId, id, days) {
    const result = await pool.query(
        `INSERT INTO area_days (subdivision_id, day)
         SELECT subdivisions.id, unnest($2::date[]) FROM subdivisions
         WHERE subdivisions.id = $1 AND subdivisions.company_id = $3
         ON CONFLICT DO NOTHING`,
        [id, days, companyId],
    );
    return result.rowCount;
}

export async function removeDay(pool, companyId, id, day) {
    const result = await pool.query(
        `DELETE FROM area_days USING subdivisions
         WHERE area_days.subdivision_id = $1 AND area_days.day = $2::date
           AND subdivisions.id = area_days.subdivision_id AND subdivisions.company_id = $3`,
        [id, day, companyId],
    );
    return result.rowCount === 1;
}

// Sets the area's city (blank clears it). Properties in the area that have no city of their own were looked up, or
// failed to be, with the old city, so their saved points are cleared and they are looked up again. Returns false when
// there is no such area. A save that changes nothing leaves the points alone.
export async function setCity(pool, companyId, id, city) {
    return withTransaction(pool, async (client) => {
        const { rows } = await client.query(
            "SELECT city FROM subdivisions WHERE id = $1 AND company_id = $2 FOR UPDATE",
            [id, companyId],
        );

        if (!rows[0]) {
            return false;
        }

        const next = city || null;

        if ((rows[0].city ?? null) !== next) {
            await client.query("UPDATE subdivisions SET city = $2 WHERE id = $1", [id, next]);
            await client.query(
                `UPDATE properties
                 SET latitude = NULL, longitude = NULL, geocode_status = 'pending', geocoded_at = NULL
                 WHERE subdivision_id = $1 AND city IS NULL`,
                [id],
            );
        }

        return true;
    });
}
