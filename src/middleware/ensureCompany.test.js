import { test } from "node:test";
import assert from "node:assert";
import ensureCompany from "./ensureCompany.js";
import { companyOf } from "../utils/company.js";

// A fake request with a fake database, so a session saved before companies existed can be built directly.
function fakeRequest(user, rows) {
    const calls = [];
    const req = {
        session: user === undefined ? {} : { user },
        app: {
            locals: {
                db: {
                    query: async (text, params) => {
                        calls.push({ text, params });
                        return { rows };
                    },
                },
            },
        },
    };
    return { req, calls };
}

function run(req) {
    return new Promise((resolve, reject) => {
        ensureCompany(req, {}, (error) => {
            return error ? reject(error) : resolve();
        });
    });
}

test("a session saved before companies existed gets its company from the users row", async () => {
    const { req, calls } = fakeRequest({ id: 7, role: "owner" }, [{ company_id: 2 }]);

    await run(req);

    assert.strictEqual(req.session.user.companyId, 2);
    assert.deepStrictEqual(calls[0].params, [7]);
});

test("a session that already has a company is left alone and costs no query", async () => {
    const { req, calls } = fakeRequest({ id: 7, companyId: 3 }, [{ company_id: 2 }]);

    await run(req);

    assert.strictEqual(req.session.user.companyId, 3);
    assert.strictEqual(calls.length, 0);
});

test("a visitor with no login is left alone and costs no query", async () => {
    const { req, calls } = fakeRequest(undefined, []);

    await run(req);

    assert.strictEqual(req.session.user, undefined);
    assert.strictEqual(calls.length, 0);
});

test("a user whose row is gone gets no company, and does not fall back to company 1", async () => {
    const { req } = fakeRequest({ id: 99 }, []);

    await run(req);

    assert.strictEqual(req.session.user.companyId, undefined);
    assert.throws(() => {
        return companyOf(req);
    }, /no company/);
});

test("companyOf returns the company from the session and refuses anything that is not a whole number", () => {
    assert.strictEqual(companyOf({ session: { user: { companyId: 2 } } }), 2);

    for (const bad of [undefined, null, "2", 2.5, NaN]) {
        assert.throws(() => {
            return companyOf({ session: { user: { companyId: bad } } });
        }, /no company/);
    }

    assert.throws(() => {
        return companyOf({ session: {} });
    }, /no company/);
});
