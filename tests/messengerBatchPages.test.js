import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./helpers/db.js";
import createApp from "../src/app.js";
import * as User from "../src/models/user.js";
import * as Customer from "../src/models/customer.js";
import * as Property from "../src/models/property.js";
import * as Area from "../src/models/area.js";
import * as AccessLink from "../src/models/accessLink.js";
import * as MessengerBatch from "../src/models/messengerBatch.js";
import * as LinkBatch from "../src/models/linkBatch.js";
import { hashPassword } from "../src/utils/password.js";

const db = testDb("messengerpages");
const pool = db.pool;
let app;
let server;
let areaId;

function listen(application) {
    return new Promise((resolve) => {
        const started = application.listen(0, () => {
            resolve(started);
        });
    });
}

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    server?.close();
    app?.locals.sessionStore.close();
    app = createApp({ pool, sessionSecret: "test-secret" });
    server = await listen(app);
    areaId = await Area.create(pool, 1, "Oakwood");
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

async function send(agent, pagePath, action, fields) {
    const _csrf = await tokenFrom(agent, pagePath);
    return agent.post(action).type("form").send({ _csrf, ...fields });
}

async function agentFor(roleName) {
    const agent = request.agent(server);
    const email = `${roleName}@example.com`;
    await User.create(pool, { companyId: 1, email, passwordHash: await hashPassword("longenough"), roleName });
    await send(agent, "/login", "/login", { email, password: "longenough" });
    return agent;
}

async function customerIn(area, name, phone, street = "1 Elm St") {
    const id = await Customer.create(pool, 1, { name, phone });
    const propertyId = await Property.create(pool, id, { street, city: "Rexburg" });
    await pool.query("UPDATE properties SET subdivision_id = $2 WHERE id = $1", [propertyId, area]);
    return id;
}

const PAGE = "/staff/messenger-batches/new";
const stage = (agent, fields = {}) => {
    return send(agent, `${PAGE}?areaId=${areaId}`, "/staff/messenger-batches", {
        areaId, days: "30", template: "Hi {name}: {link}", ...fields,
    });
};

function deepLinkOf(res) {
    return res.text.match(/value="sprinklermessenger:\/\/batch\/([A-Za-z0-9_-]{43})"/)[1];
}

test("only owner and dispatcher can use the pages, and a customer gets 403", async () => {
    const customer = await agentFor("customer");
    const visitor = request.agent(server);

    assert.strictEqual((await customer.get(PAGE)).status, 403);
    assert.strictEqual((await customer.get("/staff/messenger-batches")).status, 403);
    assert.strictEqual((await visitor.get(PAGE)).status, 302);
});

test("the preview counts customers and stages nothing", async () => {
    await customerIn(areaId, "Ann Lee", "208-555-0101");
    await customerIn(areaId, "No Phone", null, "2 Elm St");
    const dispatcher = await agentFor("dispatcher");
    const page = await dispatcher.get(`${PAGE}?areaId=${areaId}`);

    assert.strictEqual(page.status, 200);
    assert.match(page.text, /1 customer is staged to be texted/);
    assert.match(page.text, /1 customer has no usable phone/);
    assert.match(page.headers["cache-control"], /no-store/);
    const rows = await pool.query("SELECT count(*)::int AS n FROM messenger_batches");
    assert.strictEqual(rows.rows[0].n, 0);
});

test("staging also shows an Expo Go link and QR outside production, and in production only the Messenger link and QR", async () => {
    await customerIn(areaId, "Ann Lee", "(208) 555-0101");
    const dispatcher = await agentFor("dispatcher");
    const res = await stage(dispatcher);
    const token = deepLinkOf(res);

    assert.ok(res.text.includes(`--/batch/${token}`), "the Expo Go link carries the batch token");
    assert.match(res.text, /value="exp:\/\/[^"]+:\d+\/--\/batch\//);
    assert.match(res.text, /<svg [^>]*aria-label="QR code for the Expo Go link"/);
    assert.match(res.text, /<svg [^>]*aria-label="QR code for the Messenger link"/);

    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
        await customerIn(areaId, "Bob Ray", "(208) 555-0102", "3 Elm St");
        const live = await stage(dispatcher);
        assert.ok(!live.text.includes("exp://"), "production never shows the Expo Go link");
        assert.ok(!live.text.includes("Expo Go"), "production never draws the Expo Go QR code");
        assert.match(live.text, /<svg [^>]*aria-label="QR code for the Messenger link"/);
        assert.match(live.text, /sprinklermessenger:\/\/batch\//);
    } finally {
        process.env.NODE_ENV = before;
    }
});

test("staging shows a deep link once, makes no magic link, and the link opens the batch through the API", async () => {
    const ann = await customerIn(areaId, "Ann Lee", "(208) 555-0101");
    const dispatcher = await agentFor("dispatcher");
    const res = await stage(dispatcher);

    assert.strictEqual(res.status, 200);
    assert.match(res.headers["cache-control"], /no-store/);
    const links = await pool.query("SELECT count(*)::int AS n FROM access_links");
    assert.strictEqual(links.rows[0].n, 0);

    const api = await request(app).get(`/api/messenger/batches/${deepLinkOf(res)}`).set("Host", "routemaster.example");
    assert.strictEqual(api.status, 200);
    assert.strictEqual(api.body.recipients[0].customerName, "Ann Lee");
    const link = await AccessLink.findValid(pool, api.body.recipients[0].message.match(/\/l\/(\S+)$/)[1]);
    assert.strictEqual(link.customerId, ann);
});

test("only that area's customers are staged", async () => {
    await customerIn(areaId, "Ann Lee", "208-555-0101");
    const other = await Area.create(pool, 1, "Pine Hills");
    await customerIn(other, "Bo Kim", "208-555-0102");
    const dispatcher = await agentFor("dispatcher");
    await stage(dispatcher);
    const names = await pool.query(
        `SELECT customers.name FROM messenger_batch_recipients AS recipients
         JOIN customers ON customers.id = recipients.customer_id`,
    );

    assert.deepStrictEqual(names.rows.map((row) => {
        return row.name;
    }), ["Ann Lee"]);
});

test("customers who already have a working link are skipped unless asked for", async () => {
    const ann = await customerIn(areaId, "Ann Lee", "208-555-0101");
    await customerIn(areaId, "Bo Kim", "208-555-0102", "2 Elm St");
    await AccessLink.create(pool, { customerId: ann });
    const dispatcher = await agentFor("dispatcher");
    const res = await stage(dispatcher);

    assert.match(res.text, /1 customer staged from Oakwood/);
    assert.match(res.text, /already has a working link and was skipped/);
});

test("an area with nobody to text, a missing token and a bad template are refused", async () => {
    await customerIn(areaId, "No Phone", null);
    const dispatcher = await agentFor("dispatcher");

    const empty = await stage(dispatcher);
    assert.strictEqual(empty.status, 400);
    assert.match(empty.text, /nobody in that area to text/);

    const noLink = await stage(dispatcher, { template: "Hello {name}" });
    assert.strictEqual(noLink.status, 400);

    const noToken = await dispatcher.post("/staff/messenger-batches").type("form").send({ areaId, days: "30", template: "{link}" });
    assert.strictEqual(noToken.status, 403);
    const rows = await pool.query("SELECT count(*)::int AS n FROM messenger_batches");
    assert.strictEqual(rows.rows[0].n, 0);
});

test("the batch page lists who was texted from what Messenger reported, and never shows the token", async () => {
    await customerIn(areaId, "Ann Lee", "208-555-0101");
    await customerIn(areaId, "Bo Kim", "208-555-0102", "2 Elm St");
    const dispatcher = await agentFor("dispatcher");
    const staged = await stage(dispatcher);
    const token = deepLinkOf(staged);
    const fetched = await request(app).get(`/api/messenger/batches/${token}`);
    await MessengerBatch.recordResults(pool, token, [
        { recipientId: fetched.body.recipients[0].recipientId, status: "sent", at: null, error: null },
        { recipientId: fetched.body.recipients[1].recipientId, status: "failed", at: null, error: "no signal" },
    ]);
    const { rows } = await pool.query("SELECT id FROM messenger_batches");
    const page = await dispatcher.get(`/staff/messenger-batches/${rows[0].id}`);
    const list = await dispatcher.get("/staff/messenger-batches");

    assert.strictEqual(page.status, 200);
    assert.match(page.text, /1 of 2 sent, 1 failed, 0 skipped/);
    assert.match(page.text, /no signal/);
    assert.ok(!page.text.includes(token));
    assert.ok(!list.text.includes(token));
    assert.match(list.text, new RegExp(`Batch ${rows[0].id}`));
});

test("an unknown batch id is a 404", async () => {
    const dispatcher = await agentFor("dispatcher");

    assert.strictEqual((await dispatcher.get("/staff/messenger-batches/999")).status, 404);
    assert.strictEqual((await dispatcher.get("/staff/messenger-batches/abc")).status, 404);
});

const FROM_LINK_BATCH = "/staff/messenger-batches/from-link-batch";
const TEMPLATE = "Hi {name}, choose a day: {link}";

async function linkBatchFor(agent, customerIds) {
    const user = await pool.query("SELECT id FROM users LIMIT 1");
    const made = await LinkBatch.create(pool, 1, { areaId, createdBy: user.rows[0].id, days: 14, customerIds });
    return made.batchId;
}

test("starting from a link batch stages exactly its customers, for its lifetime, and makes no new link yet", async () => {
    const ann = await customerIn(areaId, "Ann Lee", "208-555-0101");
    await customerIn(areaId, "Bo Kim", "208-555-0102", "2 Elm St");
    const dispatcher = await agentFor("dispatcher");
    const linkBatchId = await linkBatchFor(dispatcher, [ann]);
    const before = await pool.query("SELECT count(*)::int AS n FROM access_links");
    const res = await send(dispatcher, "/staff/link-batches/new", FROM_LINK_BATCH, { linkBatchId, template: TEMPLATE });

    assert.strictEqual(res.status, 200);
    assert.match(res.headers["cache-control"], /no-store/);
    assert.match(res.text, /sprinklermessenger:\/\/batch\//);
    const recipients = await pool.query("SELECT customer_id FROM messenger_batch_recipients");
    assert.deepStrictEqual(recipients.rows.map((row) => {
        return row.customer_id;
    }), [ann]);
    const batch = await pool.query("SELECT link_days, message_template FROM messenger_batches");
    assert.deepStrictEqual(batch.rows, [{ link_days: 14, message_template: TEMPLATE }]);
    const after = await pool.query("SELECT count(*)::int AS n FROM access_links");
    assert.strictEqual(after.rows[0].n, before.rows[0].n);
});

test("starting from a link batch refuses an unknown batch, a bad template and a customer account", async () => {
    const ann = await customerIn(areaId, "Ann Lee", "208-555-0101");
    const dispatcher = await agentFor("dispatcher");
    const linkBatchId = await linkBatchFor(dispatcher, [ann]);

    assert.strictEqual((await send(dispatcher, "/staff/link-batches/new", FROM_LINK_BATCH, { linkBatchId: 9999, template: TEMPLATE })).status, 404);
    assert.strictEqual((await send(dispatcher, "/staff/link-batches/new", FROM_LINK_BATCH, { linkBatchId, template: "no link here" })).status, 404);
    assert.strictEqual((await send(dispatcher, "/staff/link-batches/new", FROM_LINK_BATCH, { linkBatchId: "abc", template: TEMPLATE })).status, 404);
    const customer = await agentFor("customer");
    assert.strictEqual((await send(customer, "/login", FROM_LINK_BATCH, { linkBatchId, template: TEMPLATE })).status, 403);
    const staged = await pool.query("SELECT count(*)::int AS n FROM messenger_batches");
    assert.strictEqual(staged.rows[0].n, 0);
});

test("starting from a link batch whose customers can no longer be texted shows the form with a reason, not the area", async () => {
    const ann = await customerIn(areaId, "Ann Lee", "208-555-0101");
    await customerIn(areaId, "Bo Kim", "208-555-0102", "2 Elm St");
    const dispatcher = await agentFor("dispatcher");
    const linkBatchId = await linkBatchFor(dispatcher, [ann]);
    await pool.query("UPDATE customers SET phone = '' WHERE id = $1", [ann]);
    const res = await send(dispatcher, "/staff/link-batches/new", FROM_LINK_BATCH, { linkBatchId, template: TEMPLATE });

    assert.strictEqual(res.status, 400);
    assert.match(res.text, /Nobody in that batch can be texted/);
    assert.doesNotMatch(res.text, /Bo Kim/);
    assert.strictEqual((await pool.query("SELECT count(*)::int AS n FROM messenger_batches")).rows[0].n, 0);
});

test("starting from a link batch leaves out customers whose link from it was revoked or has expired", async () => {
    const ann = await customerIn(areaId, "Ann Lee", "208-555-0101");
    const bo = await customerIn(areaId, "Bo Kim", "208-555-0102", "2 Elm St");
    const cy = await customerIn(areaId, "Cy Fox", "208-555-0103", "3 Elm St");
    const dispatcher = await agentFor("dispatcher");
    const linkBatchId = await linkBatchFor(dispatcher, [ann, bo, cy]);
    await pool.query("UPDATE access_links SET revoked_at = now() WHERE customer_id = $1", [bo]);
    await pool.query("UPDATE access_links SET expires_at = now() - interval '1 day' WHERE customer_id = $1", [cy]);
    const res = await send(dispatcher, "/staff/link-batches/new", FROM_LINK_BATCH, { linkBatchId, template: TEMPLATE });

    assert.strictEqual(res.status, 200);
    const recipients = await pool.query("SELECT customer_id FROM messenger_batch_recipients");
    assert.deepStrictEqual(recipients.rows.map((row) => {
        return row.customer_id;
    }), [ann]);
});

test("starting from a link batch whose links are all revoked stages nothing", async () => {
    const ann = await customerIn(areaId, "Ann Lee", "208-555-0101");
    const dispatcher = await agentFor("dispatcher");
    const linkBatchId = await linkBatchFor(dispatcher, [ann]);
    await pool.query("UPDATE access_links SET revoked_at = now()");
    const res = await send(dispatcher, "/staff/link-batches/new", FROM_LINK_BATCH, { linkBatchId, template: TEMPLATE });

    assert.strictEqual(res.status, 400);
    assert.match(res.text, /Nobody in that batch can be texted/);
    assert.strictEqual((await pool.query("SELECT count(*)::int AS n FROM messenger_batches")).rows[0].n, 0);
});

const againPath = (id) => {
    return `/staff/messenger-batches/${id}/stage-again`;
};

async function stagedBatch(dispatcher) {
    await customerIn(areaId, "Ann Lee", "208-555-0101");
    await customerIn(areaId, "Bo Kim", "208-555-0102", "2 Elm St");
    const staged = await stage(dispatcher);
    const { rows } = await pool.query("SELECT id FROM messenger_batches ORDER BY id DESC LIMIT 1");
    return { token: deepLinkOf(staged), id: rows[0].id };
}

test("a batch with nothing reported shows the stage again form with the double-text warning and a required box", async () => {
    const dispatcher = await agentFor("dispatcher");
    const { id } = await stagedBatch(dispatcher);
    const page = await dispatcher.get(`/staff/messenger-batches/${id}`);

    assert.match(page.text, /0 of 2 sent, 0 failed, 0 skipped,\s+2 not yet reported/);
    assert.match(page.text, new RegExp(`action="/staff/messenger-batches/${id}/stage-again"`));
    assert.match(page.text, /2 customers are still "not yet reported"/);
    assert.match(page.text, /will text them twice/);
    assert.match(page.text, /name="confirmUnreported" value="1" required/);
});

test("staging again without the box ticked is refused and stages nothing", async () => {
    const dispatcher = await agentFor("dispatcher");
    const { id, token } = await stagedBatch(dispatcher);
    const res = await send(dispatcher, `/staff/messenger-batches/${id}`, againPath(id), {});

    assert.strictEqual(res.status, 400);
    assert.match(res.text, /Tick the box/);
    const count = await pool.query("SELECT count(*)::int AS n FROM messenger_batches");
    assert.strictEqual(count.rows[0].n, 1);
    assert.strictEqual((await request(app).get(`/api/messenger/batches/${token}`)).status, 200);
});

test("staging again with the box ticked shows a new deep link once, and the old link stops opening", async () => {
    const dispatcher = await agentFor("dispatcher");
    const { id, token } = await stagedBatch(dispatcher);
    const res = await send(dispatcher, `/staff/messenger-batches/${id}`, againPath(id), { confirmUnreported: "1" });

    assert.strictEqual(res.status, 200);
    assert.match(res.text, new RegExp(`2 customers staged again from batch ${id}`));
    assert.match(res.text, /will text them again/);
    const fresh = deepLinkOf(res);
    assert.notStrictEqual(fresh, token);
    assert.strictEqual((await request(app).get(`/api/messenger/batches/${token}`)).status, 404);
    const api = await request(app).get(`/api/messenger/batches/${fresh}`);
    assert.strictEqual(api.status, 200);
    assert.strictEqual(api.body.recipients.length, 2);
    assert.ok(!res.headers["cache-control"].includes("public"));
});

test("when every recipient not sent is known failed, the form has no warning or box", async () => {
    const dispatcher = await agentFor("dispatcher");
    const { id, token } = await stagedBatch(dispatcher);
    const fetched = await request(app).get(`/api/messenger/batches/${token}`);
    await MessengerBatch.recordResults(pool, token, fetched.body.recipients.map((recipient) => {
        return { recipientId: recipient.recipientId, status: "failed", error: "no signal" };
    }));
    const page = await dispatcher.get(`/staff/messenger-batches/${id}`);

    assert.match(page.text, /stage-again/);
    assert.ok(!page.text.includes("confirmUnreported"));
    const res = await send(dispatcher, `/staff/messenger-batches/${id}`, againPath(id), {});
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /2 customers staged again/);
});

test("a batch where everyone was sent has no stage again form, and a forged post is refused", async () => {
    const dispatcher = await agentFor("dispatcher");
    const { id, token } = await stagedBatch(dispatcher);
    const fetched = await request(app).get(`/api/messenger/batches/${token}`);
    await MessengerBatch.recordResults(pool, token, fetched.body.recipients.map((recipient) => {
        return { recipientId: recipient.recipientId, status: "sent" };
    }));
    const page = await dispatcher.get(`/staff/messenger-batches/${id}`);

    assert.ok(!page.text.includes("stage-again"));
    const res = await send(dispatcher, `/staff/messenger-batches/${id}`, againPath(id), { confirmUnreported: "1" });
    assert.strictEqual(res.status, 400);
    assert.match(res.text, /Nobody in that batch can be texted again/);
});

test("stage again refuses an unknown batch, a missing csrf token and a customer account", async () => {
    const dispatcher = await agentFor("dispatcher");
    const { id } = await stagedBatch(dispatcher);

    assert.strictEqual((await send(dispatcher, `/staff/messenger-batches/${id}`, againPath(999), { confirmUnreported: "1" })).status, 404);
    assert.strictEqual((await send(dispatcher, `/staff/messenger-batches/${id}`, againPath("abc"), { confirmUnreported: "1" })).status, 404);
    assert.strictEqual((await dispatcher.post(againPath(id)).type("form").send({ confirmUnreported: "1" })).status, 403);
    const customer = await agentFor("customer");
    assert.strictEqual((await customer.post(againPath(id)).type("form").send({})).status, 403);
    const count = await pool.query("SELECT count(*)::int AS n FROM messenger_batches");
    assert.strictEqual(count.rows[0].n, 1);
});

test("stage again cannot reach another company's batch", async () => {
    const dispatcher = await agentFor("dispatcher");
    const { id } = await stagedBatch(dispatcher);
    await pool.query("INSERT INTO companies (name, slug) VALUES ('Second Co', 'second-co')");
    const other = await pool.query("SELECT id FROM companies WHERE slug = 'second-co'");
    await pool.query("UPDATE messenger_batches SET company_id = $1 WHERE id = $2", [other.rows[0].id, id]);

    assert.strictEqual((await send(dispatcher, "/staff/messenger-batches", againPath(id), { confirmUnreported: "1" })).status, 404);
});

test("stage again answers with an error, not a wrong reason, for a result the page does not know", async () => {
    const dispatcher = await agentFor("dispatcher");
    const { id } = await stagedBatch(dispatcher);
    // A batch cannot normally hold more than the limit; force it to reach the "too_many" the model can return.
    await pool.query(
        `INSERT INTO customers (name, phone, company_id, name_normalized)
         SELECT 'Extra ' || n, '208555' || lpad(n::text, 4, '0'), 1, 'extra' || n FROM generate_series(1, $1::int) AS n`,
        [MessengerBatch.MAX_BATCH],
    );
    await pool.query(
        `INSERT INTO messenger_batch_recipients (batch_id, customer_id)
         SELECT $1, id FROM customers WHERE name LIKE 'Extra %'`,
        [id],
    );
    const res = await send(dispatcher, `/staff/messenger-batches/${id}`, againPath(id), { confirmUnreported: "1" });

    assert.strictEqual(res.status, 500);
    assert.ok(!res.text.includes("Nobody in that batch can be texted again"));
});

test("a second post for the same batch is refused with where the first went, and makes no batch", async () => {
    const dispatcher = await agentFor("dispatcher");
    const { id } = await stagedBatch(dispatcher);
    const first = await send(dispatcher, `/staff/messenger-batches/${id}`, againPath(id), { confirmUnreported: "1" });
    const second = await send(dispatcher, `/staff/messenger-batches/${id}`, againPath(id), { confirmUnreported: "1" });

    assert.strictEqual(first.status, 200);
    assert.strictEqual(second.status, 409);
    assert.match(second.text, new RegExp(`Batch ${id + 1} was already staged from this batch`));
    assert.match(second.text, new RegExp(`stage again from batch ${id + 1}`));
    assert.ok(!second.text.includes("sprinklermessenger://"));
    const count = await pool.query("SELECT count(*)::int AS n FROM messenger_batches");
    assert.strictEqual(count.rows[0].n, 2);
});

test("after staging again, the old batch links to the new one and has no form, and the new one links back", async () => {
    const dispatcher = await agentFor("dispatcher");
    const { id } = await stagedBatch(dispatcher);
    await send(dispatcher, `/staff/messenger-batches/${id}`, againPath(id), { confirmUnreported: "1" });
    const old = await dispatcher.get(`/staff/messenger-batches/${id}`);
    const fresh = await dispatcher.get(`/staff/messenger-batches/${id + 1}`);

    assert.match(old.text, new RegExp(`Staged again as\\s+<a href="/staff/messenger-batches/${id + 1}">batch ${id + 1}</a>`));
    assert.ok(!old.text.includes("stage-again"));
    assert.match(fresh.text, new RegExp(`Staged again from\\s+<a href="/staff/messenger-batches/${id}">batch ${id}</a>`));
    assert.match(fresh.text, /stage-again/, "the new batch can be staged again if its link is lost");
});

test("the stage again form is marked so the browser posts it once, and loads the script that does that", async () => {
    const dispatcher = await agentFor("dispatcher");
    const { id } = await stagedBatch(dispatcher);
    const page = await dispatcher.get(`/staff/messenger-batches/${id}`);

    assert.match(page.text, /action="\/staff\/messenger-batches\/\d+\/stage-again" data-once/);
    assert.match(page.text, /<script type="module" src="\/js\/submitOnce\.js"><\/script>/);
    const script = await dispatcher.get("/js/submitOnce.js");
    assert.strictEqual(script.status, 200);
});
