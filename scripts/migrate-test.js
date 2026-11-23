// Applies new migrations to the database named by TEST_DATABASE_URL, never DATABASE_URL.
//   pnpm migrate:test
// Run it whenever `pnpm migrate` runs against production. The automated tests migrate throwaway schemas, so nothing
// else keeps the test database's own `public` schema (the one `routemaster-test` serves on port 3100) in step.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTestDatabaseUrl } from "../src/config/testDatabase.js";
import { createStartupPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
let pool = null;

try {
    // The guard throws when TEST_DATABASE_URL is missing or points at DATABASE_URL.
    pool = createStartupPool(getTestDatabaseUrl());
    const applied = await runMigrations(pool, directory);
    console.log(applied.length ? `Applied to the test database: ${applied.join(", ")}` : "Nothing to apply to the test database.");
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await pool?.end();
}
