import { test } from "node:test";
import assert from "node:assert";
import { formatAddress } from "./address.js";

test("an address prints street and city, or just the street when there is no city", () => {
    assert.strictEqual(formatAddress("12 Oak Street", "Rexburg"), "12 Oak Street, Rexburg");
    assert.strictEqual(formatAddress("12 Oak Street", null), "12 Oak Street");
    assert.strictEqual(formatAddress("12 Oak Street", ""), "12 Oak Street");
});
