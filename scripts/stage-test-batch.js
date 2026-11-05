import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { getTestDatabaseUrl } from "../src/config/testDatabase.js";
import { createPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";
import * as Customer from "../src/models/customer.js";
import * as MessengerBatch from "../src/models/messengerBatch.js";
import { expoGoLink } from "../src/utils/devAddress.js";

// Stages a Messenger batch in the TEST database and prints the deep links to open it, for trying the Messenger app
// against `pnpm dev:test`. Without --phone it stages the first three seeded customers, whose numbers are fake. With
// --phone it stages one customer, "Test Me", at that number, so a real text can be sent to your own phone.
// The batch can be fetched for an hour after this runs.
process.loadEnvFile(".env");

const { values } = parseArgs({
    options: {
        phone: { type: "string" },
        "expo-port": { type: "string", default: "8081" },
    },
});
const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
// The port `pnpm dev:test` uses unless PORT is set, which this script reads from the same environment.
const DEV_TEST_PORT = "3100";
const TEMPLATE = "Hi {name}, this is a test. Book here: {link}";

// Only ever the database named by TEST_DATABASE_URL. The guard throws if it is missing or matches DATABASE_URL.
const pool = createPool(getTestDatabaseUrl());

try {
    await runMigrations(pool, directory);
    let customerIds;

    if (values.phone) {
        const existing = await pool.query("SELECT id FROM customers WHERE name = 'Test Me' ORDER BY id LIMIT 1");
        const id = existing.rows[0]?.id ?? await Customer.create(pool, { name: "Test Me", phone: values.phone });
        // The model's update normalizes the number the way the app does, so "+1 (208) 555-0101" still matches later.
        await Customer.update(pool, id, { phone: values.phone });
        customerIds = [id];
    } else {
        const { rows } = await pool.query("SELECT id FROM customers ORDER BY id LIMIT 3");
        customerIds = rows.map((row) => {
            return row.id;
        });
    }

    const owner = await pool.query("SELECT id FROM users ORDER BY id LIMIT 1");
    const result = await MessengerBatch.stage(pool, {
        createdBy: owner.rows[0]?.id ?? null, customerIds, messageTemplate: TEMPLATE, days: 30,
    });

    if (result.error) {
        console.error(`Could not stage a batch: ${result.error}. Run pnpm seed:test first if the test database is empty.`);
        process.exitCode = 1;
    } else {
        console.log(`Staged ${result.staged} ${result.staged === 1 ? "customer" : "customers"}. Fetchable for 1 hour.`);
        console.log(`Expo Go:       ${expoGoLink(result.token, { port: values["expo-port"] })}`);
        console.log(`Dev build:     sprinklermessenger://batch/${result.token}`);
        console.log(`Server:        pnpm dev:test (port ${process.env.PORT || DEV_TEST_PORT})`);
    }
} finally {
    await pool.end();
}
