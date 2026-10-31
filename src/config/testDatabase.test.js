import { test } from "node:test";
import assert from "node:assert";
import { getTestDatabaseUrl } from "./testDatabase.js";

test("returns the test database URL when it is set and differs from DATABASE_URL", () => {
    const env = { TEST_DATABASE_URL: "postgres://test", DATABASE_URL: "postgres://real" };
    assert.strictEqual(getTestDatabaseUrl(env), "postgres://test");
});

test("refuses when TEST_DATABASE_URL is missing", () => {
    assert.throws(() => {return getTestDatabaseUrl({ DATABASE_URL: "postgres://real" });}, /not set/);
});

test("refuses when TEST_DATABASE_URL is empty", () => {
    assert.throws(() => {return getTestDatabaseUrl({ TEST_DATABASE_URL: "" });}, /not set/);
});

test("refuses when TEST_DATABASE_URL equals DATABASE_URL", () => {
    const env = { TEST_DATABASE_URL: "postgres://same", DATABASE_URL: "postgres://same" };
    assert.throws(() => {return getTestDatabaseUrl(env);}, /equals DATABASE_URL/);
});
