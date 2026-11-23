import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test, before, after } from "node:test";
import assert from "node:assert";
import { getTestDatabaseUrl } from "../../src/config/testDatabase.js";
import { createPool } from "../../src/db/pool.js";

const run = promisify(execFile);
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "migrate-test.js");
const schema = `migratetest_${process.pid}`;
const url = getTestDatabaseUrl();
const admin = createPool(url);

// Points the script at one throwaway schema so the test never changes the test database's own `public` schema.
function urlInSchema() {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
}

async function runScript(env) {
    try {
        const { stdout } = await run(process.execPath, [script], { env: { ...process.env, ...env } });
        return { code: 0, stdout, stderr: "" };
    } catch (error) {
        return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
}

before(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
});

after(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
});

test("migrate:test applies new migrations to the test database, then has nothing left to apply", async () => {
    const first = await runScript({ TEST_DATABASE_URL: urlInSchema() });
    assert.strictEqual(first.code, 0, first.stderr);
    assert.match(first.stdout, /^Applied to the test database: 001_/);

    const { rows } = await admin.query(`SELECT count(*)::int AS count FROM ${schema}.schema_migrations`);
    assert.ok(rows[0].count > 0);

    const second = await runScript({ TEST_DATABASE_URL: urlInSchema() });
    assert.strictEqual(second.code, 0, second.stderr);
    assert.match(second.stdout, /^Nothing to apply to the test database\./);
});

test("migrate:test refuses to run when TEST_DATABASE_URL is DATABASE_URL", async () => {
    const result = await runScript({ TEST_DATABASE_URL: url, DATABASE_URL: url });
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /Refusing to run database tests/);
});

test("migrate:test refuses to run with no TEST_DATABASE_URL", async () => {
    const result = await runScript({ TEST_DATABASE_URL: "" });
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /TEST_DATABASE_URL is not set/);
});
