import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTestDatabaseUrl } from "../config/testDatabase.js";
import { createPool } from "../db/pool.js";
import { runMigrations } from "../db/migrate.js";

const migrations = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

// One schema per test file inside the throwaway database. Call reset() in beforeEach.
export function testDb(prefix) {
    const url = getTestDatabaseUrl();
    const schema = `${prefix}_${process.pid}`;
    const admin = createPool(url);
    const pool = createPool(url, { options: `-c search_path=${schema}` });

    return {
        pool,
        async reset() {
            await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
            await admin.query(`CREATE SCHEMA ${schema}`);
            await runMigrations(pool, migrations);
        },
        async close() {
            await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
            await pool.end();
            await admin.end();
        },
    };
}
