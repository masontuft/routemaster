import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "./test/db.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as AccessLink from "./models/accessLink.js";
import * as MessengerBatch from "./models/messengerBatch.js";

const db = testDb("messengerbatch");
const pool = db.pool;
const ORIGIN = "https://example.test";
const TEMPLATE = "Hi {name}, book here: {link}";
let userId;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    const user = await User.create(pool, { email: "dispatch@example.com", passwordHash: "x", roleName: "dispatcher" });
    userId = user.id;
});
after(() => {
    return db.close();
});

async function stageFor(customerIds, overrides = {}) {
    return MessengerBatch.stage(pool, {
        createdBy: userId, customerIds, messageTemplate: TEMPLATE, days: 30, ...overrides,
    });
}

async function twoCustomers() {
    const ann = await Customer.create(pool, { name: "Ann Lee", phone: "(208) 555-0101" });
    const bob = await Customer.create(pool, { name: "Bob Ray", phone: "208-555-0102" });
    return [ann, bob];
}

async function age(column) {
    await pool.query(`UPDATE messenger_batches SET ${column} = now() - interval '1 minute'`);
}

test("stage stores hashes only and makes no magic link yet", async () => {
    const ids = await twoCustomers();
    const result = await stageFor(ids);

    assert.strictEqual(result.staged, 2);
    const stored = await pool.query("SELECT token_hash FROM messenger_batches");
    assert.notStrictEqual(stored.rows[0].token_hash, result.token);
    assert.strictEqual(stored.rows[0].token_hash.length, 64);
    const links = await pool.query("SELECT count(*)::int AS n FROM access_links");
    assert.strictEqual(links.rows[0].n, 0);
});

test("stage leaves out customers with no usable phone and ids that are not customers", async () => {
    const [ann] = await twoCustomers();
    const noPhone = await Customer.create(pool, { name: "No Phone", phone: "12" });
    const result = await stageFor([ann, noPhone, 999999]);

    assert.strictEqual(result.staged, 1);
    assert.strictEqual(result.noPhone, 2);
});

test("stage refuses a batch with nobody to text", async () => {
    const noPhone = await Customer.create(pool, { name: "No Phone", phone: "12" });
    assert.strictEqual((await stageFor([noPhone])).error, "empty");
    assert.strictEqual((await stageFor([])).error, "empty");
});

test("fetch returns E.164 phones and a message with that customer's own link", async () => {
    const [ann, bob] = await twoCustomers();
    const { token } = await stageFor([ann, bob]);
    const result = await MessengerBatch.fetchBatch(pool, token, ORIGIN);

    assert.strictEqual(result.recipients.length, 2);
    const first = result.recipients[0];
    assert.strictEqual(first.customerName, "Ann Lee");
    assert.strictEqual(first.phone, "+12085550101");
    const match = first.message.match(/^Hi Ann Lee, book here: https:\/\/example\.test\/l\/(\S+)$/);
    assert.ok(match);
    const link = await AccessLink.findValid(pool, match[1]);
    assert.strictEqual(link.customerId, ann);
    assert.notStrictEqual(result.recipients[1].message, first.message);
});

test("a name that looks like a placeholder is inserted as plain text", async () => {
    const odd = await Customer.create(pool, { name: "A$&{link}B", phone: "2085550103" });
    const { token } = await stageFor([odd]);
    const result = await MessengerBatch.fetchBatch(pool, token, ORIGIN);

    assert.ok(result.recipients[0].message.startsWith("Hi A$&{link}B, book here: https://example.test/l/"));
});

test("a second fetch revokes the first fetch's links and mints new ones", async () => {
    const [ann] = await twoCustomers();
    const { token } = await stageFor([ann]);
    const first = await MessengerBatch.fetchBatch(pool, token, ORIGIN);
    const second = await MessengerBatch.fetchBatch(pool, token, ORIGIN);
    const oldToken = first.recipients[0].message.split("/l/")[1];
    const newToken = second.recipients[0].message.split("/l/")[1];

    assert.notStrictEqual(oldToken, newToken);
    assert.strictEqual(await AccessLink.findValid(pool, oldToken), null);
    assert.ok(await AccessLink.findValid(pool, newToken));
});

test("a fetch after a recipient is marked sent leaves that recipient out", async () => {
    const [ann, bob] = await twoCustomers();
    const { token } = await stageFor([ann, bob]);
    const first = await MessengerBatch.fetchBatch(pool, token, ORIGIN);
    const annRow = first.recipients.find((recipient) => {
        return recipient.customerName === "Ann Lee";
    });
    await MessengerBatch.recordResults(pool, token, [{ recipientId: annRow.recipientId, status: "sent" }]);
    const second = await MessengerBatch.fetchBatch(pool, token, ORIGIN);

    assert.deepStrictEqual(second.recipients.map((recipient) => {
        return recipient.customerName;
    }), ["Bob Ray"]);
    const annLink = await AccessLink.findValid(pool, annRow.message.split("/l/")[1]);
    assert.ok(annLink, "the link in a sent text must keep working");
});

test("an unknown token and an expired fetch window both give not_found", async () => {
    const [ann] = await twoCustomers();
    const { token } = await stageFor([ann]);

    assert.strictEqual((await MessengerBatch.fetchBatch(pool, "nope", ORIGIN)).error, "not_found");
    await age("fetch_expires_at");
    assert.strictEqual((await MessengerBatch.fetchBatch(pool, token, ORIGIN)).error, "not_found");
});

test("results are accepted after the fetch window and until the results window ends", async () => {
    const [ann] = await twoCustomers();
    const { token } = await stageFor([ann]);
    const fetched = await MessengerBatch.fetchBatch(pool, token, ORIGIN);
    const results = [{ recipientId: fetched.recipients[0].recipientId, status: "sent" }];

    await age("fetch_expires_at");
    assert.strictEqual((await MessengerBatch.recordResults(pool, token, results)).updated, 1);
    await age("results_expires_at");
    assert.strictEqual((await MessengerBatch.recordResults(pool, token, results)).error, "not_found");
});

test("a partial upload updates what it names and leaves the rest pending", async () => {
    const [ann, bob] = await twoCustomers();
    const { token } = await stageFor([ann, bob]);
    const fetched = await MessengerBatch.fetchBatch(pool, token, ORIGIN);
    const outcome = await MessengerBatch.recordResults(pool, token, [
        { recipientId: fetched.recipients[0].recipientId, status: "failed", error: "no signal" },
    ]);

    assert.deepStrictEqual(outcome, { updated: 1, ignored: 0 });
    const rows = await pool.query("SELECT status, error FROM messenger_batch_recipients ORDER BY id");
    assert.deepStrictEqual(rows.rows.map((row) => {
        return row.status;
    }).sort(), ["failed", "pending"]);
});

test("sent is final, and a token cannot change another batch's recipients", async () => {
    const [ann, bob] = await twoCustomers();
    const mine = await stageFor([ann]);
    const theirs = await stageFor([bob]);
    const myRows = await MessengerBatch.fetchBatch(pool, mine.token, ORIGIN);
    const theirRows = await MessengerBatch.fetchBatch(pool, theirs.token, ORIGIN);
    const mineId = myRows.recipients[0].recipientId;

    await MessengerBatch.recordResults(pool, mine.token, [{ recipientId: mineId, status: "sent" }]);
    const later = await MessengerBatch.recordResults(pool, mine.token, [{ recipientId: mineId, status: "failed" }]);
    assert.deepStrictEqual(later, { updated: 0, ignored: 1 });

    const cross = await MessengerBatch.recordResults(pool, mine.token, [
        { recipientId: theirRows.recipients[0].recipientId, status: "sent" },
    ]);
    assert.deepStrictEqual(cross, { updated: 0, ignored: 1 });
    const status = await pool.query("SELECT status FROM messenger_batch_recipients WHERE id = $1", [
        theirRows.recipients[0].recipientId,
    ]);
    assert.strictEqual(status.rows[0].status, "pending");
});
