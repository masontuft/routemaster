import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as MessengerBatch from "./models/messengerBatch.js";
import { validateMessengerResults } from "./utils/validation.js";

const db = testDb("messengerapi");
const pool = db.pool;
let app;
let userId;
let token;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    app?.locals.sessionStore.close();
    app = createApp({ pool, sessionSecret: "test-secret" });
    const user = await User.create(pool, { email: "dispatch@example.com", passwordHash: "x", roleName: "dispatcher" });
    userId = user.id;
    const ann = await Customer.create(pool, { name: "Ann Lee", phone: "2085550101" });
    const bob = await Customer.create(pool, { name: "Bob Ray", phone: "2085550102" });
    const staged = await MessengerBatch.stage(pool, {
        createdBy: userId, customerIds: [ann, bob], messageTemplate: "Hi {name}: {link}", days: 30,
    });
    token = staged.token;
});
after(async () => {
    app?.locals.sessionStore.close();
    await db.close();
});

const fetchPath = (value) => {
    return `/api/messenger/batches/${value}`;
};

test("GET returns the batch as private JSON with no cookie", async () => {
    const res = await request(app).get(fetchPath(token)).set("Host", "routemaster.example");

    assert.strictEqual(res.status, 200);
    assert.match(res.headers["content-type"], /application\/json/);
    assert.strictEqual(res.headers["cache-control"], "no-store");
    assert.strictEqual(res.headers["set-cookie"], undefined);
    assert.strictEqual(res.body.recipients.length, 2);
    assert.strictEqual(res.body.recipients[0].phone, "+12085550101");
    assert.match(res.body.recipients[0].message, /^Hi Ann Lee: http:\/\/routemaster\.example\/l\/\S{43}$/);
});

test("GET returns the template and each recipient's link, which together make the message", async () => {
    const res = await request(app).get(fetchPath(token)).set("Host", "routemaster.example");
    const [first] = res.body.recipients;

    assert.strictEqual(res.body.template, "Hi {name}: {link}");
    assert.match(first.link, /^http:\/\/routemaster\.example\/l\/\S{43}$/);
    assert.strictEqual(first.message, res.body.template.replace("{name}", first.customerName).replace("{link}", first.link));
});

test("an unknown, malformed or expired token all answer the same 404", async () => {
    const unknown = await request(app).get(fetchPath("A".repeat(43)));
    const malformed = await request(app).get(fetchPath("short"));
    await pool.query("UPDATE messenger_batches SET fetch_expires_at = now() - interval '1 minute'");
    const expired = await request(app).get(fetchPath(token));

    for (const res of [unknown, malformed, expired]) {
        assert.strictEqual(res.status, 404);
        assert.deepStrictEqual(res.body, { error: "not_found" });
    }
});

test("POST results needs no CSRF token and saves what it is given", async () => {
    const fetched = await request(app).get(fetchPath(token));
    const [first] = fetched.body.recipients;
    const res = await request(app).post(`${fetchPath(token)}/results`).send({
        results: [{ recipientId: first.recipientId, status: "sent", at: "2026-11-05T17:12:03Z" }],
    });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { updated: 1, ignored: 0 });
    const rows = await pool.query("SELECT status, sent_at FROM messenger_batch_recipients WHERE id = $1", [first.recipientId]);
    assert.strictEqual(rows.rows[0].status, "sent");
    assert.strictEqual(rows.rows[0].sent_at.toISOString(), "2026-11-05T17:12:03.000Z");
});

test("POST results with a bad body is a 400 and saves nothing", async () => {
    const fetched = await request(app).get(fetchPath(token));
    const id = fetched.body.recipients[0].recipientId;
    const bodies = [
        {},
        { results: [] },
        { results: [{ recipientId: id, status: "delivered" }] },
        { results: [{ recipientId: "1", status: "sent" }] },
        { results: [{ recipientId: id, status: "sent" }, { recipientId: id, status: "failed", error: "x".repeat(201) }] },
        { results: [{ recipientId: id, status: "sent", at: "not a date" }] },
    ];

    for (const body of bodies) {
        const res = await request(app).post(`${fetchPath(token)}/results`).send(body);
        assert.strictEqual(res.status, 400, JSON.stringify(body));
    }

    const rows = await pool.query("SELECT count(*)::int AS n FROM messenger_batch_recipients WHERE status <> 'pending'");
    assert.strictEqual(rows.rows[0].n, 0);
});

test("POST results with broken JSON is a 400 JSON error", async () => {
    const res = await request(app).post(`${fetchPath(token)}/results`)
        .set("Content-Type", "application/json").send("{not json");

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(res.body, { error: "bad_request" });
});

test("POST results with an unknown token is the same 404", async () => {
    const res = await request(app).post(`${fetchPath("A".repeat(43))}/results`).send({
        results: [{ recipientId: 1, status: "sent" }],
    });

    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, { error: "not_found" });
});

test("an unknown API path is a JSON 404, not the HTML page", async () => {
    const res = await request(app).get("/api/messenger/nothing");

    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, { error: "not_found" });
});

test("the API has its own rate limit and answers 429 as JSON", async () => {
    app.locals.sessionStore.close();
    app = createApp({ pool, sessionSecret: "test-secret", apiRateLimitMax: 2 });
    await request(app).get(fetchPath("A".repeat(43)));
    await request(app).get(fetchPath("A".repeat(43)));
    const res = await request(app).get(fetchPath("A".repeat(43)));

    assert.strictEqual(res.status, 429);
    assert.deepStrictEqual(res.body, { error: "rate_limited" });
});

test("the staff pages still need a CSRF token", async () => {
    const res = await request(app).post("/login").type("form").send({ email: "a@b.co", password: "x" });

    assert.strictEqual(res.status, 403);
});

test("validateMessengerResults turns at into an ISO string and rejects more than 500 results", () => {
    const ok = validateMessengerResults({ results: [{ recipientId: 4, status: "sent", at: "2026-11-05T10:00:00-07:00" }] });
    assert.strictEqual(ok.results[0].at, "2026-11-05T17:00:00.000Z");

    const many = Array.from({ length: 501 }, (_, index) => {
        return { recipientId: index + 1, status: "sent" };
    });
    assert.strictEqual(validateMessengerResults({ results: many }).errors.length, 1);
});
