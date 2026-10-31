import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";

const url = process.env.DATABASE_URL;

if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
}

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const pool = createPool(url);

try {
    const applied = await runMigrations(pool, directory);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Nothing to apply.");
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
