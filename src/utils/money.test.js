import { test } from "node:test";
import assert from "node:assert";
import { parsePriceCents, formatCents } from "./money.js";

test("prices parse to integer cents", () => {
    assert.strictEqual(parsePriceCents("12"), 1200);
    assert.strictEqual(parsePriceCents("12.5"), 1250);
    assert.strictEqual(parsePriceCents("$12.05"), 1205);
    assert.strictEqual(parsePriceCents("0"), 0);
    assert.strictEqual(parsePriceCents("99999.99"), 9999999);
});

test("bad prices are rejected", () => {
    for (const value of ["", "abc", "-1", "1.234", "100000", "1e3", "1,000", undefined]) {
        assert.strictEqual(parsePriceCents(value), null, String(value));
    }
});

test("cents format as dollars", () => {
    assert.strictEqual(formatCents(0), "$0.00");
    assert.strictEqual(formatCents(1205), "$12.05");
});
