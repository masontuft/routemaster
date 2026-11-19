import { test } from "node:test";
import assert from "node:assert";
import { validateCompanyInput } from "./companyInput.js";
import { parseCompanyArgs } from "./companyArgs.js";

const GOOD = {
    name: "Acme Lawn", slug: "acme-lawn", ownerEmail: "Owner@Example.com ", password: "longenough",
    services: ["Aeration=75.00", "Fall Cleanup=120", "Walk Through"],
};

test("good input gives clean values: a trimmed name, a lower-cased email, and services with prices in cents", () => {
    const { values, errors } = validateCompanyInput(GOOD);

    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(values, {
        name: "Acme Lawn", slug: "acme-lawn", ownerEmail: "owner@example.com",
        services: [
            { name: "Aeration", priceCents: 7500 },
            { name: "Fall Cleanup", priceCents: 12000 },
            { name: "Walk Through", priceCents: 0 },
        ],
    });
});

test("the password is checked but never copied into the result", () => {
    const { values } = validateCompanyInput(GOOD);

    assert.doesNotMatch(JSON.stringify(values), /longenough/);
    assert.ok(!("password" in values));
});

test("a slug must be lower-case words joined by hyphens, and short", () => {
    for (const slug of ["Acme Lawn", "-acme", "acme-", "acme--lawn", "acme_lawn", "", undefined, "a".repeat(41)]) {
        assert.ok(validateCompanyInput({ ...GOOD, slug }).errors.some((error) => {
            return /slug/.test(error);
        }), `slug ${JSON.stringify(slug)} was accepted`);
    }

    assert.deepStrictEqual(validateCompanyInput({ ...GOOD, slug: "a".repeat(40) }).errors, []);
    assert.deepStrictEqual(validateCompanyInput({ ...GOOD, slug: "tuft-2" }).errors, []);
});

test("a name, an email and a password must be usable", () => {
    assert.match(validateCompanyInput({ ...GOOD, name: "  " }).errors[0], /company name/);
    assert.match(validateCompanyInput({ ...GOOD, name: "x".repeat(101) }).errors[0], /company name/);
    assert.match(validateCompanyInput({ ...GOOD, ownerEmail: "not an email" }).errors[0], /email/);
    assert.match(validateCompanyInput({ ...GOOD, password: "short" }).errors[0], /at least 8/);
    assert.match(validateCompanyInput({ ...GOOD, password: undefined }).errors[0], /at least 8/);
    assert.match(validateCompanyInput({ ...GOOD, password: "é".repeat(37) }).errors[0], /at most 72 bytes/);
});

test("a bad service is reported by name, and a service listed twice is refused whatever its case", () => {
    const bad = validateCompanyInput({ ...GOOD, services: ["Aeration=abc", "=5", "x".repeat(81), "Mulch=1.5", "mulch=2"] });

    assert.strictEqual(bad.errors.length, 4);
    assert.match(bad.errors[0], /Aeration/);
    assert.match(bad.errors[3], /twice/);
    assert.deepStrictEqual(validateCompanyInput({ ...GOOD, services: [] }).values.services, []);
    assert.deepStrictEqual(validateCompanyInput({ ...GOOD, services: undefined }).errors, []);
});

test("the command line is read into options, with --service allowed more than once", () => {
    const { options, errors } = parseCompanyArgs([
        "--name", "Acme Lawn", "--slug", "acme-lawn", "--owner-email", "o@example.com",
        "--service", "Aeration=75", "--service", "Mulch", "--dry-run",
    ]);

    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(options, {
        name: "Acme Lawn", slug: "acme-lawn", ownerEmail: "o@example.com", services: ["Aeration=75", "Mulch"], dryRun: true,
    });
    assert.deepStrictEqual(parseCompanyArgs([]).options.services, []);
    assert.strictEqual(parseCompanyArgs([]).options.dryRun, false);
});

test("a flag it does not know, a flag with no value, and a stray word are errors, so a typo is not ignored", () => {
    for (const argv of [["--slg", "acme"], ["--name"], ["acme-lawn"], ["--password", "secret"]]) {
        const { options, errors } = parseCompanyArgs(argv);

        assert.strictEqual(options, null, JSON.stringify(argv));
        assert.strictEqual(errors.length, 1);
    }
});
