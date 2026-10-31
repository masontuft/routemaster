import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;

// Applies each new migration file once, in name order. Forward-only: applied files are never changed.
export async function runMigrations(pool, directory) {
    const files = (await readdir(directory)).filter((name) => {
        return name.endsWith(".sql");
    }).sort();

    for (const name of files) {
        if (!FILE_PATTERN.test(name)) {
            throw new Error(`Migration file name must look like 001_create_things.sql: ${name}`);
        }
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);

    const { rows } = await pool.query("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((row) => {
        return row.name;
    }));
    const newlyApplied = [];

    for (const name of files) {
        if (applied.has(name)) {
            continue;
        }

        const sql = await readFile(path.join(directory, name), "utf8");
        const client = await pool.connect();

        try {
            await client.query("BEGIN");
            await client.query(sql);
            await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
            await client.query("COMMIT");
            newlyApplied.push(name);
        } catch (error) {
            await client.query("ROLLBACK");
            throw new Error(`Migration ${name} failed: ${error.message}`, { cause: error });
        } finally {
            client.release();
        }
    }

    return newlyApplied;
}
