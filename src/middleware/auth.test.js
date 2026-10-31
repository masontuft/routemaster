import { test } from "node:test";
import assert from "node:assert";
import { requireLogin, requireRole } from "./auth.js";

function run(middleware, user) {
    const result = { redirected: null, error: null, passed: false };
    const req = { session: { user } };
    const res = {
        redirect: (to) => {
            result.redirected = to;
        },
    };
    middleware(req, res, (error) => {
        result.error = error ?? null;
        result.passed = !error;
    });
    return result;
}

test("requireLogin redirects a visitor to /login", () => {
    assert.strictEqual(run(requireLogin, undefined).redirected, "/login");
});

test("requireLogin lets a logged-in user through", () => {
    assert.strictEqual(run(requireLogin, { role: "customer" }).passed, true);
});

test("requireRole redirects a visitor to /login", () => {
    assert.strictEqual(run(requireRole("owner"), undefined).redirected, "/login");
});

test("requireRole forbids the wrong role with status 403", () => {
    const result = run(requireRole("owner", "dispatcher"), { role: "customer" });
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.error.status, 403);
});

test("requireRole allows any listed role", () => {
    assert.strictEqual(run(requireRole("owner", "dispatcher"), { role: "dispatcher" }).passed, true);
});
