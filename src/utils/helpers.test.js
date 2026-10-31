import { test } from "node:test";
import assert from "node:assert";
import { normalizeName, normalizeAddress, normalizePhone } from "./normalize.js";
import { isProduction } from "./env.js";
import { generateToken, hashToken } from "./token.js";
import { validatePreferredDate, parseId, validateIdentity, validateProperty } from "./validation.js";

test("isProduction trims and ignores case", () => {
    assert.strictEqual(isProduction("production"), true);
    assert.strictEqual(isProduction("Production"), true);
    assert.strictEqual(isProduction("PRODUCTION"), true);
    assert.strictEqual(isProduction(" production "), true);
    assert.strictEqual(isProduction("development"), false);
    assert.strictEqual(isProduction("prod"), false);
    assert.strictEqual(isProduction(""), false);
    assert.strictEqual(isProduction(undefined), false);
});

test("names and addresses ignore case, punctuation and extra spaces", () => {
    assert.strictEqual(normalizeName("  Ann   O'Neil "), "ann o neil");
    assert.strictEqual(normalizeAddress("123 Main Street."), normalizeAddress("123  main ST"));
    assert.strictEqual(normalizeAddress("9 Oak Avenue"), "9 oak ave");
});

test("phones keep digits and drop a leading country 1", () => {
    assert.strictEqual(normalizePhone("(208) 555-0101"), "2085550101");
    assert.strictEqual(normalizePhone("+1 208 555 0101"), "2085550101");
    assert.strictEqual(normalizePhone(""), "");
});

test("tokens are long, unique, and hashed deterministically", () => {
    const a = generateToken();
    assert.ok(a.length >= 43);
    assert.notStrictEqual(a, generateToken());
    assert.strictEqual(hashToken(a), hashToken(a));
    assert.notStrictEqual(hashToken(a), a);
    assert.strictEqual(hashToken(a).length, 64);
});

test("preferred dates: today and a year out pass; past, bad, impossible and far dates fail", () => {
    const today = "2026-10-31";
    assert.strictEqual(validatePreferredDate("2026-10-31", today), null);
    assert.strictEqual(validatePreferredDate("2027-10-31", today), null);
    assert.match(validatePreferredDate("2026-10-30", today), /today or later/);
    assert.match(validatePreferredDate("2027-12-01", today), /within the next year/);
    assert.match(validatePreferredDate("2026-02-30", today), /valid date/);
    assert.match(validatePreferredDate("tomorrow", today), /valid date/);
    assert.match(validatePreferredDate(undefined, today), /valid date/);
});

test("ids must be plain positive integers", () => {
    assert.strictEqual(parseId("42"), 42);
    assert.strictEqual(parseId("4x"), null);
    assert.strictEqual(parseId("-1"), null);
    assert.strictEqual(parseId(undefined), null);
});

test("identity and property forms reject empty or malformed input", () => {
    assert.strictEqual(validateIdentity({ name: "Ann", phone: "208-555-0101", address: "1 Main St" }).errors.length, 0);
    assert.strictEqual(validateIdentity({}).errors.length, 3);
    assert.strictEqual(validateIdentity({ name: "Ann", phone: "123", address: "1 Main St" }).errors.length, 1);
    assert.strictEqual(validateProperty({ street: "1 Main St", city: "Rexburg", zip: "83440" }).errors.length, 0);
    assert.strictEqual(validateProperty({ street: "1 Main St", city: "Rexburg", zip: "abc" }).errors.length, 1);
    assert.strictEqual(validateProperty({}).errors.length, 2);
});
