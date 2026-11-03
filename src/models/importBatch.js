// Records of confirmed imports and the column mappings they used. The import itself writes through
// src/import/apply.js; these are the small reads and upserts around it.

export async function create(client, details) {
    const { createdBy, sheetId, sheetName, seasonYear, planHash, counts } = details;
    const { rows } = await client.query(
        `INSERT INTO import_batches
            (created_by, sheet_id, sheet_name, season_year, plan_hash,
             customers_created, properties_created, jobs_created, jobs_existing, rows_skipped)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
            createdBy ?? null, sheetId, sheetName, seasonYear, planHash,
            counts.customersCreated, counts.propertiesCreated, counts.jobsCreated,
            counts.jobsExisting, counts.rowsSkipped,
        ],
    );
    return rows[0].id;
}

export async function find(pool, id) {
    const { rows } = await pool.query(
        `SELECT import_batches.id, import_batches.sheet_name, import_batches.season_year,
                import_batches.customers_created, import_batches.properties_created,
                import_batches.jobs_created, import_batches.jobs_existing, import_batches.rows_skipped,
                import_batches.created_at, users.email AS created_by_email,
                (SELECT count(*)::int FROM properties
                 WHERE properties.import_batch_id = import_batches.id AND properties.city IS NULL)
                    AS properties_without_city
         FROM import_batches
         LEFT JOIN users ON users.id = import_batches.created_by
         WHERE import_batches.id = $1`,
        [id],
    );
    return rows[0] ?? null;
}

export async function saveMapping(client, { sheetId, sheetName, headerRow, columns, options }) {
    await client.query(
        `INSERT INTO import_mappings (sheet_id, sheet_name, header_row, columns, options)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (sheet_id, sheet_name)
         DO UPDATE SET header_row = EXCLUDED.header_row, columns = EXCLUDED.columns,
                       options = EXCLUDED.options, updated_at = now()`,
        [sheetId, sheetName, headerRow, JSON.stringify(columns), JSON.stringify(options ?? {})],
    );
}

export async function findMapping(pool, sheetId, sheetName) {
    const { rows } = await pool.query(
        "SELECT header_row, columns, options FROM import_mappings WHERE sheet_id = $1 AND sheet_name = $2",
        [sheetId, sheetName],
    );
    return rows[0] ?? null;
}

// The batch row is created first, so the rows it creates can point at it, and its counts are set at the end.
export async function setCounts(client, id, counts) {
    await client.query(
        `UPDATE import_batches
         SET customers_created = $2, properties_created = $3, jobs_created = $4, jobs_existing = $5, rows_skipped = $6
         WHERE id = $1`,
        [
            id, counts.customersCreated, counts.propertiesCreated,
            counts.jobsCreated, counts.jobsExisting, counts.rowsSkipped,
        ],
    );
}

// Every batch with how many of its customers are still on file, newest first.
export async function listWithRemaining(pool) {
    const { rows } = await pool.query(
        `SELECT import_batches.id, import_batches.sheet_name, import_batches.season_year, import_batches.created_at,
                (SELECT count(*)::int FROM customers WHERE customers.import_batch_id = import_batches.id)
                    AS customers_remaining
         FROM import_batches
         ORDER BY import_batches.id DESC`,
    );
    return rows;
}

export async function exists(pool, id) {
    const { rows } = await pool.query("SELECT 1 FROM import_batches WHERE id = $1", [id]);
    return rows.length === 1;
}
