import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "../test/db.js";
import * as Customer from "./customer.js";
import * as Lead from "./lead.js";

const db = testDb("lead");
const pool = db.pool;
const typed = { name: "Sam & Ruth Example", phone: "(801) 555-0101", address: "12 Oak Street" };

before(() => {
    return db.reset();
});
beforeEach(() => {
    return db.reset();
});
after(() => {
    return db.close();
});

test("the same person and address, typed differently, is one lead", async () => {
    const first = await Lead.findOrCreate(pool, 1, typed);
    const second = await Lead.findOrCreate(pool, 1, { name: "sam and ruth example", phone: "801-555-0101", address: "12 oak st." });

    assert.strictEqual(second, first);
    assert.deepStrictEqual(await Lead.findById(pool, 1, first), { id: first, ...typed, customer_id: null });
});

test("a different address or a different phone is a different lead", async () => {
    const first = await Lead.findOrCreate(pool, 1, typed);

    assert.notStrictEqual(await Lead.findOrCreate(pool, 1, { ...typed, address: "40 Pine Lane" }), first);
    assert.notStrictEqual(await Lead.findOrCreate(pool, 1, { ...typed, phone: "801-555-9999" }), first);
});

test("two visitors submitting the same details at once still make one lead", async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => {
        return Lead.findOrCreate(pool, 1, typed);
    }));

    assert.strictEqual(new Set(ids).size, 1);
    assert.strictEqual((await pool.query("SELECT count(*)::int AS total FROM leads")).rows[0].total, 1);
});

test("an unknown lead id finds nothing", async () => {
    assert.strictEqual(await Lead.findById(pool, 1, 999999), null);
});

test("a lead is converted once, and cannot be pointed at a second customer", async () => {
    const lead = await Lead.findOrCreate(pool, 1, typed);
    const first = await Customer.create(pool, 1, { name: typed.name, phone: typed.phone });
    const second = await Customer.create(pool, 1, { name: "Someone Else" });

    assert.strictEqual(await Lead.markConverted(pool, 1, lead, first), true);
    assert.strictEqual(await Lead.markConverted(pool, 1, lead, second), false);
    assert.strictEqual((await Lead.findById(pool, 1, lead)).customer_id, first);
});

test("deleting the customer a lead became deletes the lead, and a stranger's lead stays", async () => {
    const lead = await Lead.findOrCreate(pool, 1, typed);
    const stranger = await Lead.findOrCreate(pool, 1, { ...typed, name: "Cy Doe" });
    const customer = await Customer.create(pool, 1, { name: typed.name });
    await Lead.markConverted(pool, 1, lead, customer);
    await pool.query("DELETE FROM customers WHERE id = $1", [customer]);

    assert.strictEqual(await Lead.findById(pool, 1, lead), null);
    assert.ok(await Lead.findById(pool, 1, stranger));
});
