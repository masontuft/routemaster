import { test } from "node:test";
import assert from "node:assert";
import { hashPassword, verifyPassword } from "./password.js";
import { validateRegistration } from "./validation.js";

test("a hash verifies only the password it came from", async () => {
    const hash = await hashPassword("P@$$w0rd!");
    assert.notStrictEqual(hash, "P@$$w0rd!");
    assert.strictEqual(await verifyPassword("P@$$w0rd!", hash), true);
    assert.strictEqual(await verifyPassword("wrong-password", hash), false);
});

test("hashing the same password twice gives different hashes", async () => {
    assert.notStrictEqual(await hashPassword("same-password"), await hashPassword("same-password"));
});

test("valid registration input has no errors and a normalized email", () => {
    const result = validateRegistration({ email: "  Ann@Example.COM ", password: "longenough", confirm: "longenough" });
    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.email, "ann@example.com");
});

test("registration rejects empty, short, mismatched and oversized input", () => {
    assert.ok(validateRegistration({}).errors.length >= 2);
    assert.ok(validateRegistration({ email: "a@b.co", password: "short", confirm: "short" }).errors.length === 1);
    assert.ok(validateRegistration({ email: "a@b.co", password: "longenough", confirm: "different" }).errors.length === 1);
    const big = "x".repeat(73);
    assert.ok(validateRegistration({ email: "a@b.co", password: big, confirm: big }).errors.length === 1);
    assert.ok(validateRegistration({ email: "not-an-email", password: "longenough", confirm: "longenough" })
        .errors.length === 1);
});
