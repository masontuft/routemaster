import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as Company from "./models/company.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import { createCompany } from "./db/createCompany.js";
import { hashPassword, verifyPassword } from "./utils/password.js";

// Making a company (ADR 0018): the model, and the command behind `pnpm company:create`, on the test database.

const db = testDb("company");
const pool = db.pool;
const PASSWORD = "an-owner-password";
const ARGV = [
    "--name", "Acme Lawn", "--slug", "acme-lawn", "--owner-email", "owner@acme.example",
    "--service", "Aeration=75.00", "--service", "Fall Cleanup=120",
];
let app;
let server;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    server?.close();
    app?.locals.sessionStore.close();
    app = createApp({ pool, sessionSecret: "test-secret" });
    server = await new Promise((resolve) => {
        const started = app.listen(0, () => {
            resolve(started);
        });
    });
});
after(async () => {
    server?.close();
    app?.locals.sessionStore.close();
    await db.close();
});

// The hash is stubbed for the tests that do not log in, because the real one takes a quarter of a second.
const fastHash = async (password) => {
    return `hashed:${password}`;
};

function run(argv = ARGV, env = { OWNER_PASSWORD: PASSWORD }, hash = fastHash) {
    return createCompany({ argv, env, pool, hash, baseUrl: "https://routemaster.example" });
}

async function count(table) {
    return (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
}

test("it makes a company, its owner and its services, in the new company and no other", async () => {
    const { exitCode, lines, made } = await run();

    assert.strictEqual(exitCode, 0);
    assert.strictEqual(made.companyId, 2);
    assert.deepStrictEqual((await Company.findBySlug(pool, "acme-lawn")), { id: 2, name: "Acme Lawn", slug: "acme-lawn" });
    assert.deepStrictEqual((await Company.findById(pool, 2)).slug, "acme-lawn");
    assert.strictEqual(await Company.findBySlug(pool, "no-such-company"), null);

    const owner = await pool.query(
        "SELECT users.email, users.company_id, roles.name AS role FROM users JOIN roles ON roles.id = users.role_id",
    );
    assert.deepStrictEqual(owner.rows, [{ email: "owner@acme.example", company_id: 2, role: "owner" }]);

    const services = await pool.query("SELECT name, price_cents, active, company_id FROM service_types WHERE company_id = 2 ORDER BY id");
    assert.deepStrictEqual(services.rows, [
        { name: "Aeration", price_cents: 7500, active: true, company_id: 2 },
        { name: "Fall Cleanup", price_cents: 12000, active: true, company_id: 2 },
    ]);
    // Company 1 keeps its own two services and gains nothing.
    assert.strictEqual((await pool.query("SELECT count(*)::int AS n FROM service_types WHERE company_id = 1")).rows[0].n, 2);
    assert.match(lines.join("\n"), /https:\/\/routemaster\.example\/w\/acme-lawn/);
});

test("the owner's password is hashed, stored, and never printed", async () => {
    const { lines } = await run(ARGV, { OWNER_PASSWORD: PASSWORD }, hashPassword);
    const { rows } = await pool.query("SELECT password_hash FROM users WHERE email = 'owner@acme.example'");

    assert.doesNotMatch(lines.join("\n"), new RegExp(PASSWORD));
    assert.notStrictEqual(rows[0].password_hash, PASSWORD);
    assert.ok(await verifyPassword(PASSWORD, rows[0].password_hash));
});

test("the new owner can log in and uses the app for their own company, and sees none of company 1", async () => {
    await Customer.create(pool, 1, { name: "Ann Lee", phone: "208-555-0101" });
    await run(ARGV, { OWNER_PASSWORD: PASSWORD }, hashPassword);
    const agent = request.agent(server);
    const page = await agent.get("/login");
    const _csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];

    const login = await agent.post("/login").type("form").send({ _csrf, email: "owner@acme.example", password: PASSWORD });
    const customers = await agent.get("/staff/customers");
    const services = await agent.get("/admin/service-types");

    assert.strictEqual(login.status, 302);
    assert.strictEqual(customers.status, 200);
    assert.doesNotMatch(customers.text, /Ann Lee/);
    assert.match(services.text, /Aeration/);
    assert.doesNotMatch(services.text, /Sprinkler Blowout/);
});

test("a dry run checks everything and prints what it would make, but writes nothing", async () => {
    const before = { companies: await count("companies"), users: await count("users"), services: await count("service_types") };

    const { exitCode, lines } = await run([...ARGV, "--dry-run"]);

    assert.strictEqual(exitCode, 0);
    assert.match(lines[0], /Dry run\. Nothing was created/);
    assert.match(lines.join("\n"), /Aeration {2}\$75\.00/);
    assert.deepStrictEqual(
        { companies: await count("companies"), users: await count("users"), services: await count("service_types") },
        before,
    );
});

test("a slug or an owner email that is already used is refused, and nothing is created", async () => {
    await User.create(pool, { companyId: 1, email: "taken@example.com", passwordHash: "x", roleName: "dispatcher" });
    const before = { companies: await count("companies"), users: await count("users") };

    const slug = await run(["--name", "Copy", "--slug", "tuft-sprinkler-blowouts", "--owner-email", "new@example.com"]);
    const email = await run(["--name", "Copy", "--slug", "copy", "--owner-email", "Taken@Example.com"]);
    const both = await run(["--name", "Copy", "--slug", "tuft-sprinkler-blowouts", "--owner-email", "taken@example.com"]);

    assert.deepStrictEqual([slug.exitCode, email.exitCode, both.exitCode], [1, 1, 1]);
    assert.match(slug.lines[0], /slug "tuft-sprinkler-blowouts" is already used/);
    assert.match(email.lines[0], /taken@example\.com already has a login/);
    assert.strictEqual(both.lines.length, 3);
    assert.deepStrictEqual({ companies: await count("companies"), users: await count("users") }, before);
});

test("bad input is reported all at once, with the usage, and nothing is created", async () => {
    const { exitCode, lines } = await run(
        ["--name", "", "--slug", "Bad Slug", "--owner-email", "nope", "--service", "Aeration=abc"],
        { OWNER_PASSWORD: "short" },
    );

    assert.strictEqual(exitCode, 1);
    const text = lines.join("\n");
    for (const part of [/company name/, /slug/, /email/, /at least 8/, /Aeration/, /Usage: pnpm company:create/]) {
        assert.match(text, part);
    }
    assert.strictEqual(await count("companies"), 1);
});

test("a missing password, or a flag it does not know, is an error", async () => {
    const noPassword = await run(ARGV, {});
    const typo = await run(["--slg", "acme-lawn"]);

    assert.strictEqual(noPassword.exitCode, 1);
    assert.match(noPassword.lines.join("\n"), /OWNER_PASSWORD/);
    assert.strictEqual(typo.exitCode, 1);
    assert.match(typo.lines[0], /--slg/);
    assert.strictEqual(await count("companies"), 1);
});

test("a failure part-way through leaves nothing behind", async () => {
    // Two services with the same name get past the model, which trusts validated input, and fail on the second insert.
    // The company and the owner made before it must be rolled back with it.
    await assert.rejects(Company.createWithOwner(pool, {
        name: "Acme Lawn", slug: "acme-lawn", ownerEmail: "owner@acme.example", ownerPasswordHash: "x",
        services: [{ name: "Aeration", priceCents: 1 }, { name: "Aeration", priceCents: 2 }],
    }), /unique/);

    assert.strictEqual(await Company.findBySlug(pool, "acme-lawn"), null);
    assert.strictEqual(await count("companies"), 1);
    assert.strictEqual((await pool.query("SELECT count(*)::int AS n FROM users WHERE email = 'owner@acme.example'")).rows[0].n, 0);
});

test("two creations racing for one slug or email: one wins and the other is told, not crashed", async () => {
    const make = (email) => {
        return Company.createWithOwner(pool, {
            name: "Acme", slug: "acme-lawn", ownerEmail: email, ownerPasswordHash: "x", services: [],
        });
    };

    const first = await make("a@example.com");
    const second = await make("b@example.com");
    const third = await Company.createWithOwner(pool, {
        name: "Other", slug: "other", ownerEmail: "a@example.com", ownerPasswordHash: "x", services: [],
    });

    assert.ok(first.companyId);
    assert.deepStrictEqual(second, { error: "slug_taken" });
    assert.deepStrictEqual(third, { error: "email_taken" });
    assert.strictEqual(await count("companies"), 2);
});

test("a company with no services is made, and says the owner adds them", async () => {
    const { exitCode, lines } = await run(["--name", "Bare Co", "--slug", "bare-co", "--owner-email", "o@bare.example"]);

    assert.strictEqual(exitCode, 0);
    assert.match(lines.join("\n"), /Services: none/);
    assert.strictEqual((await pool.query("SELECT count(*)::int AS n FROM service_types WHERE company_id = 2")).rows[0].n, 0);
});
