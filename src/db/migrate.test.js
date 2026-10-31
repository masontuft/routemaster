import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTestDatabaseUrl } from "../config/testDatabase.js";
import { createPool } from "./pool.js";
import { runMigrations } from "./migrate.js";

const realMigrations = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");
const url = getTestDatabaseUrl();
const schema = `test_${process.pid}`;
let admin;
let pool;

before(async () => {
    admin = createPool(url);
    pool = createPool(url, { options: `-c search_path=${schema}` });
});

beforeEach(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
});

after(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
    await admin.end();
});

async function tempDir(files) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "migrations-"));
    for (const [name, sql] of Object.entries(files)) {
        await writeFile(path.join(dir, name), sql);
    }
    return dir;
}

test("applies the real migrations in order and records them", async () => {
    const applied = await runMigrations(pool, realMigrations);
    assert.deepStrictEqual(applied, ["001_create_roles.sql", "002_create_users.sql"]);

    const roles = await pool.query("SELECT name FROM roles ORDER BY id");
    assert.deepStrictEqual(roles.rows.map((row) => {
        return row.name;
    }), ["owner", "dispatcher", "customer"]);
});

test("a second run applies nothing", async () => {
    await runMigrations(pool, realMigrations);
    assert.deepStrictEqual(await runMigrations(pool, realMigrations), []);
});

test("a failing file rolls back and is not recorded", async () => {
    const dir = await tempDir({
        "001_good.sql": "CREATE TABLE good (id INT);",
        "002_bad.sql": "CREATE TABLE half (id INT); SELECT * FROM missing_table;",
    });

    try {
        await assert.rejects(runMigrations(pool, dir), /002_bad\.sql failed/);
        const recorded = await pool.query("SELECT name FROM schema_migrations");
        assert.deepStrictEqual(recorded.rows.map((row) => {
            return row.name;
        }), ["001_good.sql"]);
        const half = await pool.query("SELECT to_regclass('half') AS found");
        assert.strictEqual(half.rows[0].found, null);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test("rejects a badly named file", async () => {
    const dir = await tempDir({ "create_things.sql": "SELECT 1;" });

    try {
        await assert.rejects(runMigrations(pool, dir), /must look like/);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test("rejects a missing directory", async () => {
    await assert.rejects(runMigrations(pool, "/no/such/dir"));
});

test("a user cannot reference a role that does not exist", async () => {
    await runMigrations(pool, realMigrations);
    await assert.rejects(
        pool.query("INSERT INTO users (email, password_hash, role_id) VALUES ('a@b.c', 'x', 999)"),
        /foreign key/,
    );
});
