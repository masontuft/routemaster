import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTestDatabaseUrl } from "../src/config/testDatabase.js";
import { createPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedTestData } from "../src/db/seedTestData.js";
import * as User from "../src/models/user.js";
import { hashPassword } from "../src/utils/password.js";

const password = process.env.SEED_PASSWORD;

if (!password) {
    console.error("SEED_PASSWORD must be set.");
    process.exit(1);
}

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const accounts = [
    { email: "owner@example.com", roleName: "owner" },
    { email: "dispatcher@example.com", roleName: "dispatcher" },
    { email: "customer@example.com", roleName: "customer" },
];

// Only ever the database named by TEST_DATABASE_URL. The guard throws if it is missing or matches DATABASE_URL.
const pool = createPool(getTestDatabaseUrl());

try {
    if (process.argv.includes("--reset")) {
        await pool.query("DROP SCHEMA public CASCADE");
        await pool.query("CREATE SCHEMA public");
        console.log("Reset the test database.");
    }

    const applied = await runMigrations(pool, directory);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "No new migrations.");

    const passwordHash = await hashPassword(password);
    let dispatcherId = null;

    for (const account of accounts) {
        const created = await User.create(pool, { ...account, passwordHash });
        const user = created ?? await User.findByEmail(pool, account.email);
        console.log(`${account.email}: ${created ? "created" : "already exists"}`);

        if (account.roleName === "dispatcher") {
            dispatcherId = user.id;
        }
    }

    const result = await seedTestData(pool, { dispatcherId });
    console.log(result.seeded
        ? `Seeded ${result.customers} customers and a route for ${result.route}.`
        : "Sample data already there. Run with --reset to start over.");
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
