import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "../test/db.js";
import * as Customer from "../models/customer.js";
import * as Property from "../models/property.js";
import { classifyCandidates } from "./matching.js";

const db = testDb("importmatch");
const pool = db.pool;

before(() => {
    return db.reset();
});
beforeEach(() => {
    return db.reset();
});
after(() => {
    return db.close();
});

function candidate(rowNumber, fields = {}) {
    return {
        rowNumber,
        name: "Ada Example",
        phone: "801-555-0100",
        street: "1 Test Street",
        city: null,
        zip: null,
        date: null,
        amountCents: null,
        area: null,
        notes: null,
        issues: [],
        blocked: false,
        ...fields,
    };
}

async function customerWithProperty(name, phone, street) {
    const customerId = await Customer.create(pool, { name, phone });
    const propertyId = await Property.create(pool, customerId, { street, city: "Testville" });
    return { customerId, propertyId };
}

async function kindsOf(...candidates) {
    const { rows } = await classifyCandidates(pool, candidates);
    return rows.map((row) => {
        return row.match.kind;
    });
}

test("an empty list needs no queries and gives zero counts", async () => {
    let queries = 0;
    const counting = {
        query: (...args) => {
            queries += 1;
            return pool.query(...args);
        },
    };

    const { rows, summary } = await classifyCandidates(counting, []);

    assert.deepStrictEqual(rows, []);
    assert.strictEqual(queries, 0);
    assert.deepStrictEqual(summary, {
        total: 0, properties: 0, warnings: 0, blocked: 0, flagged: 0, existing: 0, new_property: 0, new: 0,
    });
});

test("same customer on the same street, spelled differently, is existing", async () => {
    const { customerId, propertyId } = await customerWithProperty("Ada Example", "(801) 555-0100", "1 Test St");

    const { rows } = await classifyCandidates(pool, [candidate(2, { street: "1 test STREET." })]);

    assert.deepStrictEqual(rows[0].match, { kind: "existing", customerId, propertyId });
});

test("a missing phone on either side does not stop a name and street match", async () => {
    await customerWithProperty("Ada Example", null, "1 Test St");
    await customerWithProperty("Bob Example", "801-555-0111", "2 Test St");

    assert.deepStrictEqual(await kindsOf(
        candidate(2, { phone: "(801) 555-0100" }),
        candidate(3, { name: "Bob Example", phone: null, street: "2 Test St" }),
    ), ["existing", "existing"]);
});

test("a street that belongs to someone else is flagged, not matched", async () => {
    const { customerId, propertyId } = await customerWithProperty("Cy Other", "801-555-0199", "1 Test St");

    const { rows } = await classifyCandidates(pool, [
        candidate(2),
        candidate(3, { name: "Cy Other", phone: "801-555-0100" }),
    ]);

    assert.deepStrictEqual(rows[0].match, { kind: "flagged", customerId, propertyId });
    assert.strictEqual(rows[1].match.kind, "flagged", "same name but a different phone is not the same customer");
});

test("with two customers on one street, the one that matches the row wins", async () => {
    await customerWithProperty("Cy Other", "801-555-0199", "1 Test St");
    const ada = await customerWithProperty("Ada Example", "801-555-0100", "1 Test St");

    const { rows } = await classifyCandidates(pool, [candidate(2)]);

    assert.deepStrictEqual(rows[0].match, { kind: "existing", ...ada });
});

test("a known customer at a street not on file is a new property for that customer", async () => {
    await customerWithProperty("Ada Example", "801-555-0100", "9 Elsewhere Ave");

    const { rows } = await classifyCandidates(pool, [candidate(2)]);

    assert.strictEqual(rows[0].match.kind, "new_property");
    assert.ok(rows[0].match.customerId > 0);
    assert.strictEqual(rows[0].match.propertyId, null);
});

test("name alone, without a phone, never links to an existing customer", async () => {
    await customerWithProperty("Ada Example", "801-555-0100", "9 Elsewhere Ave");

    assert.deepStrictEqual(await kindsOf(candidate(2, { phone: null })), ["new"]);
});

test("nothing on file means a new customer and property", async () => {
    assert.deepStrictEqual(await kindsOf(candidate(2)), ["new"]);
});

test("blocked rows are never looked up", async () => {
    const { rows, summary } = await classifyCandidates(pool, [
        candidate(2, { name: null, blocked: true, issues: ["Missing customer name."] }),
    ]);

    assert.strictEqual(rows[0].match.kind, "blocked");
    assert.strictEqual(summary.blocked, 1);
    assert.strictEqual(summary.warnings, 0);
});

test("rows on one street are one property, and a different name there is a warning", async () => {
    const { rows, summary } = await classifyCandidates(pool, [
        candidate(2),
        candidate(3, { street: "1 test st" }),
        candidate(4, { name: "Bob Example", street: "2 Test St" }),
        candidate(5, { name: "Cy Other", street: "2 Test Street" }),
    ]);

    assert.deepStrictEqual(rows.map((row) => {
        return row.groupSize;
    }), [2, 2, 2, 2]);
    assert.deepStrictEqual(rows[0].issues, []);
    assert.deepStrictEqual(rows[2].issues, ["Other rows on this street have a different name."]);
    assert.strictEqual(summary.properties, 2);
    assert.strictEqual(summary.warnings, 2);
});

test("the input candidates are not changed", async () => {
    const input = [candidate(2, { name: "Bob Example" }), candidate(3, { name: "Cy Other" })];
    await classifyCandidates(pool, input);
    assert.deepStrictEqual(input[0].issues, []);
    assert.strictEqual(input[0].match, undefined);
});

test("a long sheet takes three queries, not one per row", async () => {
    await customerWithProperty("Ada Example", "801-555-0100", "1 Test St");
    let queries = 0;
    const counting = {
        query: (...args) => {
            queries += 1;
            return pool.query(...args);
        },
    };
    const many = Array.from({ length: 300 }, (unused, index) => {
        return candidate(index + 2, { name: `Person ${index}`, street: `${index + 10} Test St`, phone: `801555${String(index).padStart(4, "0")}` });
    });

    const { summary } = await classifyCandidates(counting, [...many, candidate(400)]);

    assert.strictEqual(summary.existing, 1);
    assert.strictEqual(summary.new, 300);
    assert.ok(queries <= 3, `used ${queries} queries`);
});
