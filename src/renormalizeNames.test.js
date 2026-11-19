import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "./test/db.js";
import * as Customer from "./models/customer.js";
import { renormalizeCustomerNames } from "./db/renormalizeNames.js";

const db = testDb("renormalize");
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

// Customers saved under the old rules: "&" and the apostrophe had become spaces.
async function seedOldKeys() {
    const couple = await Customer.create(pool, 1, { name: "Sam & Ruth Example", phone: "801-555-0101" });
    const renter = await Customer.create(pool, 1, { name: "Nina Sample (rental)", phone: "801-555-0102" });
    const plain = await Customer.create(pool, 1, { name: "Ann Lee", phone: "801-555-0103" });
    await pool.query("UPDATE customers SET name_normalized = 'sam ruth example' WHERE id = $1", [couple]);
    await pool.query("UPDATE customers SET name_normalized = 'nina sample rental' WHERE id = $1", [renter]);
    return { couple, renter, plain };
}

async function keyOf(id) {
    const { rows } = await pool.query("SELECT name_normalized FROM customers WHERE id = $1", [id]);
    return rows[0].name_normalized;
}

test("a dry run reports what would change and writes nothing", async () => {
    const ids = await seedOldKeys();
    const result = await renormalizeCustomerNames(pool);

    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.changed, 2);
    assert.strictEqual(result.applied, false);
    assert.deepStrictEqual(result.examples.map((change) => { return [change.id, change.from, change.to]; }), [
        [ids.couple, "sam ruth example", "sam and ruth example"],
        [ids.renter, "nina sample rental", "nina sample"],
    ]);
    assert.strictEqual(await keyOf(ids.couple), "sam ruth example");
    assert.strictEqual(await keyOf(ids.renter), "nina sample rental");
});

test("an apply writes the new keys, touches nothing else, and a second run has nothing to do", async () => {
    const ids = await seedOldKeys();
    const result = await renormalizeCustomerNames(pool, { apply: true });

    assert.deepStrictEqual([result.total, result.changed, result.applied], [3, 2, true]);
    assert.strictEqual(await keyOf(ids.couple), "sam and ruth example");
    assert.strictEqual(await keyOf(ids.renter), "nina sample");
    assert.strictEqual(await keyOf(ids.plain), "ann lee");
    assert.strictEqual((await Customer.findById(pool, 1, ids.renter)).name, "Nina Sample (rental)");

    const again = await renormalizeCustomerNames(pool, { apply: true });
    assert.strictEqual(again.changed, 0);
    assert.deepStrictEqual(again.examples, []);
});

test("no customers is not an error", async () => {
    const result = await renormalizeCustomerNames(pool, { apply: true });
    assert.deepStrictEqual([result.total, result.changed], [0, 0]);
});
