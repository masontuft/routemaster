import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "./test/db.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import * as Area from "./models/area.js";
import * as AccessLink from "./models/accessLink.js";
import * as LinkBatch from "./models/linkBatch.js";

const db = testDb("linkbatch");
const pool = db.pool;
let oakwood;
let pine;
let userId;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    oakwood = await Area.create(pool, "Oakwood");
    pine = await Area.create(pool, "Pine Hills");
    const user = await User.create(pool, { email: "dispatch@example.com", passwordHash: "x", roleName: "dispatcher" });
    userId = user.id;
});
after(() => {
    return db.close();
});

async function customerIn(areaId, name, phone, streets = ["1 Elm St"]) {
    const id = await Customer.create(pool, { name, phone });

    for (const street of streets) {
        const propertyId = await Property.create(pool, id, { street, city: "Rexburg" });
        await pool.query("UPDATE properties SET subdivision_id = $2 WHERE id = $1", [propertyId, areaId]);
    }

    return id;
}

async function count(table) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
}

const run = (overrides = {}) => {
    return LinkBatch.create(pool, { areaId: oakwood, createdBy: userId, days: 30, ...overrides });
};

test("only customers with a property in the area get a link, each once", async () => {
    const ann = await customerIn(oakwood, "Ann Lee", "208-555-0101", ["1 Elm St", "2 Elm St"]);
    await customerIn(pine, "Bo Kim", "208-555-0102");

    const result = await run();

    assert.deepStrictEqual(result.rows.map((row) => {
        return row.customerId;
    }), [ann]);
    assert.strictEqual(await count("access_links"), 1);
});

test("the tokens work for their customer, and only their hashes are stored", async () => {
    const ann = await customerIn(oakwood, "Ann Lee", "208-555-0101");

    const { rows } = await run();

    assert.deepStrictEqual(await AccessLink.findValid(pool, rows[0].token), { id: 1, customerId: ann });
    const stored = await pool.query("SELECT token_hash FROM access_links");
    assert.notStrictEqual(stored.rows[0].token_hash, rows[0].token);
    assert.strictEqual(stored.rows[0].token_hash.length, 64);
});

test("a customer with a blank or too-short phone is listed, not linked", async () => {
    await customerIn(oakwood, "Ann Lee", "208-555-0101");
    const none = await customerIn(oakwood, "No Phone", null);
    const short = await customerIn(oakwood, "Short Phone", "555-0100");

    const result = await run();

    assert.strictEqual(result.rows.length, 1);
    assert.deepStrictEqual(result.noPhone.map((customer) => {
        return customer.id;
    }).sort(), [none, short].sort());
    assert.strictEqual(await count("access_links"), 1);
});

test("a customer with a working link is skipped unless asked for, and an expired or revoked one does not count", async () => {
    const active = await customerIn(oakwood, "Has Active", "208-555-0101");
    const expired = await customerIn(oakwood, "Has Expired", "208-555-0102");
    const revoked = await customerIn(oakwood, "Has Revoked", "208-555-0103");
    await AccessLink.create(pool, { customerId: active });
    await AccessLink.create(pool, { customerId: expired, days: -1 });
    const token = await AccessLink.create(pool, { customerId: revoked });
    await AccessLink.revoke(pool, (await AccessLink.findValid(pool, token)).id);

    const first = await run();
    assert.deepStrictEqual(first.rows.map((row) => {
        return row.customerId;
    }).sort(), [expired, revoked].sort());
    assert.strictEqual(first.skippedActive, 1);

    const everyone = await run({ includeActive: true });
    assert.strictEqual(everyone.rows.length, 3);
});

test("the batch records who ran it, the area, the lifetime and the counts, and tags its links", async () => {
    await customerIn(oakwood, "Ann Lee", "208-555-0101");
    await customerIn(oakwood, "No Phone", null);

    const { batchId } = await run({ days: 45 });

    const batch = (await pool.query("SELECT * FROM link_batches WHERE id = $1", [batchId])).rows[0];
    assert.deepStrictEqual(
        [batch.subdivision_id, batch.created_by, batch.days, batch.links_created, batch.skipped_no_phone],
        [oakwood, userId, 45, 1, 1],
    );
    const link = (await pool.query("SELECT link_batch_id, created_by, expires_at FROM access_links")).rows[0];
    assert.strictEqual(link.link_batch_id, batchId);
    assert.strictEqual(link.created_by, userId);
    const daysLeft = (link.expires_at - Date.now()) / 86400000;
    assert.ok(daysLeft > 44.9 && daysLeft < 45.1);
});

test("an unknown area and a bad lifetime create nothing", async () => {
    await customerIn(oakwood, "Ann Lee", "208-555-0101");
    await customerIn(oakwood, "Bo Kim", "208-555-0102");

    assert.deepStrictEqual(await LinkBatch.create(pool, { areaId: 9999, createdBy: userId, days: 30 }), { error: "not_found" });
    for (const days of [0, 121, 1.5, "30", NaN]) {
        await assert.rejects(run({ days }), RangeError);
    }

    assert.strictEqual(await count("access_links"), 0);
    assert.strictEqual(await count("link_batches"), 0);
});

test("a failure part way rolls back the batch row and every link", async () => {
    await customerIn(oakwood, "Ann Lee", "208-555-0101");

    await assert.rejects(run({ createdBy: 99999 }));

    assert.strictEqual(await count("access_links"), 0);
    assert.strictEqual(await count("link_batches"), 0);
});

test("preview counts match what a run would do and create nothing", async () => {
    await customerIn(oakwood, "Ann Lee", "208-555-0101");
    await customerIn(oakwood, "Has Active", "208-555-0102");
    await customerIn(oakwood, "No Phone", null);
    await AccessLink.create(pool, { customerId: 2 });

    assert.deepStrictEqual(await LinkBatch.preview(pool, oakwood), { toLink: 1, noPhone: 1, skippedActive: 1 });
    assert.deepStrictEqual(
        await LinkBatch.preview(pool, oakwood, { includeActive: true }),
        { toLink: 2, noPhone: 1, skippedActive: 0 },
    );
    assert.strictEqual(await LinkBatch.preview(pool, 9999), null);
    assert.strictEqual(await count("access_links"), 1);
});

test("a batch over the cap is refused before anything is created", async () => {
    await pool.query(
        `INSERT INTO customers (name, name_normalized, phone, phone_normalized)
         SELECT 'C' || g, 'c' || g, '20855' || lpad(g::text, 5, '0'), '20855' || lpad(g::text, 5, '0')
         FROM generate_series(1, $1::int) g`,
        [LinkBatch.MAX_BATCH + 1],
    );
    await pool.query(
        `INSERT INTO properties (customer_id, street, city, address_normalized, subdivision_id)
         SELECT id, '1 Elm St', 'Rexburg', '1 elm st', $1 FROM customers`,
        [oakwood],
    );

    const result = await run();

    assert.deepStrictEqual(result, { error: "too_many", count: LinkBatch.MAX_BATCH + 1 });
    assert.strictEqual(await count("access_links"), 0);
    assert.strictEqual(await count("link_batches"), 0);
});
