import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "./helpers/db.js";
import * as User from "../src/models/user.js";
import * as Customer from "../src/models/customer.js";
import * as AccessLink from "../src/models/accessLink.js";
import * as MessengerBatch from "../src/models/messengerBatch.js";

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
    const user = await User.create(pool, { companyId: 1, email: "dispatch@example.com", passwordHash: "x", roleName: "dispatcher" });
    userId = user.id;
});
after(() => {
    return db.close();
});

async function stageFor(customerIds, overrides = {}) {
    return MessengerBatch.stage(pool, 1, {
        createdBy: userId, customerIds, messageTemplate: TEMPLATE, days: 30, ...overrides,
    });
}

async function twoCustomers() {
    const ann = await Customer.create(pool, 1, { name: "Ann Lee", phone: "(208) 555-0101" });
    const bob = await Customer.create(pool, 1, { name: "Bob Ray", phone: "208-555-0102" });
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
    const noPhone = await Customer.create(pool, 1, { name: "No Phone", phone: "12" });
    const result = await stageFor([ann, noPhone, 999999]);

    assert.strictEqual(result.staged, 1);
    assert.strictEqual(result.noPhone, 2);
});

test("stage refuses a batch with nobody to text", async () => {
    const noPhone = await Customer.create(pool, 1, { name: "No Phone", phone: "12" });
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
    const odd = await Customer.create(pool, 1, { name: "A$&{link}B", phone: "2085550103" });
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

async function recipientStatuses(batchId) {
    const { rows } = await pool.query(
        `SELECT customers.name, recipients.status FROM messenger_batch_recipients AS recipients
         JOIN customers ON customers.id = recipients.customer_id
         WHERE recipients.batch_id = $1 ORDER BY customers.name`,
        [batchId],
    );
    return rows.map((row) => {
        return `${row.name}:${row.status}`;
    });
}

test("stage again takes everyone not sent, copies the message and days, and makes a new token", async () => {
    const [ann, bob] = await twoCustomers();
    const cy = await Customer.create(pool, 1, { name: "Cy Fox", phone: "208-555-0103" });
    const first = await stageFor([ann, bob, cy], { messageTemplate: "Custom {name} {link}", days: 14 });
    const fetched = await MessengerBatch.fetchBatch(pool, first.token, ORIGIN);
    const byName = Object.fromEntries(fetched.recipients.map((recipient) => {
        return [recipient.customerName, recipient.recipientId];
    }));
    await MessengerBatch.recordResults(pool, first.token, [
        { recipientId: byName["Ann Lee"], status: "sent" },
        { recipientId: byName["Bob Ray"], status: "skipped" },
    ]);

    const again = await MessengerBatch.stageAgain(pool, 1, first.batchId, {
        createdBy: userId, confirmUnreported: true,
    });

    assert.strictEqual(again.staged, 2);
    assert.notStrictEqual(again.batchId, first.batchId);
    assert.notStrictEqual(again.token, first.token);
    assert.strictEqual(again.fromBatchId, first.batchId);
    assert.strictEqual(again.days, 14);
    assert.deepStrictEqual(await recipientStatuses(again.batchId), ["Bob Ray:pending", "Cy Fox:pending"]);
    const fresh = await MessengerBatch.fetchBatch(pool, again.token, ORIGIN);
    assert.match(fresh.recipients[0].message, /^Custom Bob Ray https:\/\/example\.test\/l\//);
    const row = await pool.query("SELECT link_days, created_by FROM messenger_batches WHERE id = $1", [again.batchId]);
    assert.strictEqual(row.rows[0].link_days, 14);
    assert.strictEqual(row.rows[0].created_by, userId);
});

test("stage again closes the old batch's fetch window but still accepts its results", async () => {
    const [ann] = await twoCustomers();
    const first = await stageFor([ann]);
    const fetched = await MessengerBatch.fetchBatch(pool, first.token, ORIGIN);
    await MessengerBatch.stageAgain(pool, 1, first.batchId, {
        createdBy: userId, confirmUnreported: true,
    });

    assert.strictEqual((await MessengerBatch.fetchBatch(pool, first.token, ORIGIN)).error, "not_found");
    const late = await MessengerBatch.recordResults(pool, first.token, [
        { recipientId: fetched.recipients[0].recipientId, status: "sent" },
    ]);
    assert.strictEqual(late.updated, 1);
});

test("stage again does not reopen a fetch window that already ended", async () => {
    const [ann] = await twoCustomers();
    const first = await stageFor([ann]);
    await age("fetch_expires_at");
    const before = await pool.query("SELECT fetch_expires_at FROM messenger_batches WHERE id = $1", [first.batchId]);
    await MessengerBatch.stageAgain(pool, 1, first.batchId, {
        createdBy: userId, confirmUnreported: true,
    });
    const after = await pool.query("SELECT fetch_expires_at FROM messenger_batches WHERE id = $1", [first.batchId]);

    assert.deepStrictEqual(after.rows[0].fetch_expires_at, before.rows[0].fetch_expires_at);
});

test("stage again asks for confirmation while any recipient was never reported, and changes nothing until it has it", async () => {
    const [ann, bob] = await twoCustomers();
    const first = await stageFor([ann, bob]);
    const refused = await MessengerBatch.stageAgain(pool, 1, first.batchId, { createdBy: userId });

    assert.deepStrictEqual(refused, { error: "needs_confirmation", unreported: 2 });
    const count = await pool.query("SELECT count(*)::int AS n FROM messenger_batches");
    assert.strictEqual(count.rows[0].n, 1);
    assert.notStrictEqual((await MessengerBatch.fetchBatch(pool, first.token, ORIGIN)).error, "not_found", "the old window is untouched");
});

test("stage again needs no confirmation when every recipient not sent is known failed or skipped", async () => {
    const [ann, bob] = await twoCustomers();
    const first = await stageFor([ann, bob]);
    const fetched = await MessengerBatch.fetchBatch(pool, first.token, ORIGIN);
    await MessengerBatch.recordResults(pool, first.token, [
        { recipientId: fetched.recipients[0].recipientId, status: "failed", error: "no signal" },
        { recipientId: fetched.recipients[1].recipientId, status: "skipped" },
    ]);
    const again = await MessengerBatch.stageAgain(pool, 1, first.batchId, { createdBy: userId });

    assert.strictEqual(again.staged, 2);
});

test("stage again refuses a batch where everyone was sent, an unknown batch and another company's batch", async () => {
    const [ann] = await twoCustomers();
    const first = await stageFor([ann]);
    const fetched = await MessengerBatch.fetchBatch(pool, first.token, ORIGIN);
    await MessengerBatch.recordResults(pool, first.token, [{ recipientId: fetched.recipients[0].recipientId, status: "sent" }]);

    assert.strictEqual((await MessengerBatch.stageAgain(pool, 1, first.batchId, { createdBy: userId })).error, "empty");
    assert.strictEqual((await MessengerBatch.stageAgain(pool, 1, 999999, { createdBy: userId })).error, "not_found");
    await pool.query("INSERT INTO companies (id, name, slug) VALUES (2, 'Other Co', 'other-co')");
    assert.strictEqual((await MessengerBatch.stageAgain(pool, 2, first.batchId, { createdBy: userId })).error, "not_found");
    const count = await pool.query("SELECT count(*)::int AS n FROM messenger_batches");
    assert.strictEqual(count.rows[0].n, 1);
});

test("stage again leaves out a customer who has since lost their phone number, and nothing changes when none are left", async () => {
    const [ann] = await twoCustomers();
    const first = await stageFor([ann]);
    await pool.query("UPDATE customers SET phone = NULL WHERE id = $1", [ann]);

    const again = await MessengerBatch.stageAgain(pool, 1, first.batchId, {
        createdBy: userId, confirmUnreported: true,
    });

    assert.strictEqual(again.error, "empty");
    assert.notStrictEqual((await MessengerBatch.fetchBatch(pool, first.token, ORIGIN)).error, "not_found");
});

test("stage again records its source, and a second try for the same source gets already_staged and makes nothing", async () => {
    const [ann, bob] = await twoCustomers();
    const first = await stageFor([ann, bob]);
    const again = await MessengerBatch.stageAgain(pool, 1, first.batchId, {
        createdBy: userId, confirmUnreported: true,
    });
    const twice = await MessengerBatch.stageAgain(pool, 1, first.batchId, {
        createdBy: userId, confirmUnreported: true,
    });

    assert.deepStrictEqual(twice, { error: "already_staged", batchId: again.batchId });
    const rows = await pool.query("SELECT id, restaged_from FROM messenger_batches ORDER BY id");
    assert.deepStrictEqual(rows.rows, [
        { id: first.batchId, restaged_from: null },
        { id: again.batchId, restaged_from: first.batchId },
    ]);
});

test("the already staged check comes before the confirmation check", async () => {
    const [ann] = await twoCustomers();
    const first = await stageFor([ann]);
    const again = await MessengerBatch.stageAgain(pool, 1, first.batchId, {
        createdBy: userId, confirmUnreported: true,
    });
    const refresh = await MessengerBatch.stageAgain(pool, 1, first.batchId, { createdBy: userId });

    assert.deepStrictEqual(refresh, { error: "already_staged", batchId: again.batchId });
});

test("two requests at once make one new batch, and the other is told which", async () => {
    const [ann, bob] = await twoCustomers();
    const first = await stageFor([ann, bob]);
    const results = await Promise.all([1, 2].map(() => {
        return MessengerBatch.stageAgain(pool, 1, first.batchId, {
            createdBy: userId, confirmUnreported: true,
        });
    }));
    const made = results.filter((result) => {
        return !result.error;
    });
    const refused = results.filter((result) => {
        return result.error === "already_staged";
    });

    assert.strictEqual(made.length, 1);
    assert.strictEqual(refused.length, 1);
    assert.strictEqual(refused[0].batchId, made[0].batchId);
    const count = await pool.query("SELECT count(*)::int AS n FROM messenger_batches");
    assert.strictEqual(count.rows[0].n, 2);
});

test("a new batch whose link was lost can itself be staged again", async () => {
    const [ann] = await twoCustomers();
    const first = await stageFor([ann]);
    const second = await MessengerBatch.stageAgain(pool, 1, first.batchId, {
        createdBy: userId, confirmUnreported: true,
    });
    const third = await MessengerBatch.stageAgain(pool, 1, second.batchId, {
        createdBy: userId, confirmUnreported: true,
    });

    assert.strictEqual(third.fromBatchId, second.batchId);
    assert.notStrictEqual(third.batchId, second.batchId);
});

test("the database itself refuses a second batch for the same source", async () => {
    const [ann] = await twoCustomers();
    const first = await stageFor([ann]);
    await MessengerBatch.stageAgain(pool, 1, first.batchId, {
        createdBy: userId, confirmUnreported: true,
    });

    await assert.rejects(pool.query(
        `INSERT INTO messenger_batches (token_hash, message_template, link_days, fetch_expires_at, results_expires_at,
                                        company_id, restaged_from)
         VALUES (repeat('a', 64), 'x {link}', 30, now(), now(), 1, $1)`,
        [first.batchId],
    ), { code: "23505" });
});

test("list and find say which batch a batch was staged from and as", async () => {
    const [ann] = await twoCustomers();
    const first = await stageFor([ann]);
    const again = await MessengerBatch.stageAgain(pool, 1, first.batchId, {
        createdBy: userId, confirmUnreported: true,
    });
    const old = await MessengerBatch.find(pool, 1, first.batchId);
    const fresh = await MessengerBatch.find(pool, 1, again.batchId);

    assert.strictEqual(old.restaged_from, null);
    assert.strictEqual(old.restaged_as, again.batchId);
    assert.strictEqual(fresh.restaged_from, first.batchId);
    assert.strictEqual(fresh.restaged_as, null);
});
