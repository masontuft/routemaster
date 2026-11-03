import { test } from "node:test";
import assert from "node:assert";
import { editableFields, refusedFields } from "./permissions.js";

test("the owner edits everything, the dispatcher edits contact details, city and ZIP", () => {
    assert.deepStrictEqual(editableFields("customer", "owner"), ["name", "phone", "email"]);
    assert.deepStrictEqual(editableFields("customer", "dispatcher"), ["phone", "email"]);
    assert.deepStrictEqual(editableFields("property", "owner"), ["street", "city", "zip", "notes"]);
    assert.deepStrictEqual(editableFields("property", "dispatcher"), ["city", "zip", "notes"]);
});

test("a customer or an unknown role edits nothing", () => {
    assert.deepStrictEqual(editableFields("customer", "customer"), []);
    assert.deepStrictEqual(editableFields("property", undefined), []);
});

test("a posted field the role may not change is named, and unknown fields are ignored", () => {
    const body = { name: "New Name", phone: "208-555-0100", _csrf: "x", isAdmin: "1" };

    assert.deepStrictEqual(refusedFields("customer", "dispatcher", body), ["name"]);
    assert.deepStrictEqual(refusedFields("customer", "owner", body), []);
    assert.deepStrictEqual(refusedFields("property", "dispatcher", { street: "1 Elm St", city: "Rexburg" }), ["street"]);
});
