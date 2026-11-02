import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import { hashPassword } from "./utils/password.js";
import { SpreadsheetImportError } from "./import/errors.js";

const db = testDb("import");
const pool = db.pool;
const fixture = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "import", "fixtures", "tiny.xlsx"));
const LINK = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit";

let app;
let server;
let fetchSheet;
let fetchCalls;

function listen(application) {
    return new Promise((resolve) => {
        const started = application.listen(0, () => {
            resolve(started);
        });
    });
}

async function start(options = {}) {
    server?.close();
    app?.locals.sessionStore.close();
    app = createApp({
        pool,
        sessionSecret: "test-secret",
        fetchSheet: (link) => {
            fetchCalls.push(link);
            return fetchSheet(link);
        },
        ...options,
    });
    server = await listen(app);
}

before(() => {return db.reset();});
beforeEach(async () => {
    await db.reset();
    fetchCalls = [];
    fetchSheet = async () => {return { bytes: fixture };};
    await start();
});
after(async () => {
    server?.close();
    app?.locals.sessionStore.close();
    await db.close();
});

async function tokenFrom(agent, pagePath) {
    const res = await agent.get(pagePath);
    return res.text.match(/name="_csrf" value="([^"]+)"/)[1];
}

async function loginAs(agent, role) {
    const email = `${role}@example.com`;
    await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName: role });
    const _csrf = await tokenFrom(agent, "/login");
    await agent.post("/login").type("form").send({ _csrf, email, password: "longenough" });
}

async function ownerAgent() {
    const agent = request.agent(server);
    await loginAs(agent, "owner");
    return agent;
}

async function submit(agent, link = LINK) {
    const _csrf = await tokenFrom(agent, "/admin/import");
    return agent.post("/admin/import").type("form").send({ _csrf, link });
}

test("the import page sends a visitor to log in and refuses a dispatcher and a customer", async () => {
    const visitor = await request(server).get("/admin/import");
    assert.strictEqual(visitor.status, 302);
    assert.strictEqual(visitor.headers.location, "/login");

    const visitorPost = await request(server).post("/admin/import").type("form").send({ link: LINK });
    assert.strictEqual(visitorPost.status, 403);

    for (const role of ["dispatcher", "customer"]) {
        const agent = request.agent(server);
        await loginAs(agent, role);
        assert.strictEqual((await agent.get("/admin/import")).status, 403, role);
        assert.strictEqual((await agent.post("/admin/import").type("form").send({ link: LINK })).status, 403, role);
    }

    assert.strictEqual(fetchCalls.length, 0);
});

test("a post without a CSRF token is refused and never reaches Google", async () => {
    const agent = await ownerAgent();
    const res = await agent.post("/admin/import").type("form").send({ link: LINK });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(fetchCalls.length, 0);
});

test("the owner sees the form and a link in the nav", async () => {
    const agent = await ownerAgent();
    const res = await agent.get("/admin/import");
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /name="link"/);
    assert.match(res.text, /href="\/admin\/import"/);
});

test("a good link lists each sheet with its row and column counts", async () => {
    const agent = await ownerAgent();
    const res = await submit(agent);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(fetchCalls, [LINK]);
    assert.match(res.text, /Sheets Found/);
    assert.match(res.text, /<tr><td>[^<]+<\/td><td>\d+<\/td><td>\d+<\/td><\/tr>/);
});

test("import errors re-render with a safe message and never echo the link", async () => {
    const cases = [
        ["invalid_link", 400, "That link is not a Google Sheet link."],
        ["not_public", 400, "That sheet is private."],
        ["too_large", 400, "That file is too large."],
        ["timeout", 502, "Google took too long."],
        ["network", 502, "Google could not be reached."],
    ];
    const agent = await ownerAgent();

    for (const [code, status, message] of cases) {
        fetchSheet = async () => {
            throw new SpreadsheetImportError(code, message);
        };
        const res = await submit(agent, `${LINK}?secret=abc`);
        assert.strictEqual(res.status, status, code);
        assert.ok(res.text.includes(message), code);
        assert.ok(res.text.includes("secret=abc") === false, code);
        assert.ok(res.text.includes("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms") === false, code);
    }
});

test("an unexpected error goes to the global handler, not the page", async () => {
    fetchSheet = async () => {
        throw new Error("boom with internal detail");
    };
    const agent = await ownerAgent();
    const res = await submit(agent);
    assert.strictEqual(res.status, 500);
    assert.ok(res.text.includes("boom with internal detail") === false);
});

test("a bad workbook from Google is a 400 from the parser", async () => {
    fetchSheet = async () => {return { bytes: Buffer.from("PK\x03\x04 not really a workbook") };};
    const agent = await ownerAgent();
    const res = await submit(agent);
    assert.strictEqual(res.status, 400);
});

test("import posts count against the shared per-IP limit", async () => {
    // The login post spends one of the three, so exactly two import posts fit.
    await start({ rateLimitMax: 3 });
    const agent = await ownerAgent();
    assert.strictEqual((await submit(agent)).status, 200);
    assert.strictEqual((await submit(agent)).status, 200);
    assert.strictEqual((await submit(agent)).status, 429);
});
