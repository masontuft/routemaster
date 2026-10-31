import { test } from "node:test";
import assert from "node:assert";
import { STATUSES, allowedNext, canMove } from "./transitions.js";

const ALLOWED = [
    ["Needs Review", "Requested"],
    ["Needs Review", "Cancelled"],
    ["Requested", "Scheduled"],
    ["Requested", "Cancelled"],
    ["Scheduled", "Scheduled"],
    ["Scheduled", "Completed"],
    ["Scheduled", "Cancelled"],
];

test("every pair of statuses is allowed only if it is in the table", () => {
    for (const from of STATUSES) {
        for (const to of STATUSES) {
            const expected = ALLOWED.some(([a, b]) => {
                return a === from && b === to;
            });
            assert.strictEqual(canMove(from, to), expected, `${from} -> ${to}`);
        }
    }
});

test("Completed and Cancelled are final, and an unknown status allows nothing", () => {
    assert.deepStrictEqual(allowedNext("Completed"), []);
    assert.deepStrictEqual(allowedNext("Cancelled"), []);
    assert.deepStrictEqual(allowedNext("Bogus"), []);
    assert.strictEqual(canMove("Requested", "Bogus"), false);
});
