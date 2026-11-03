import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import { hashPassword } from "./utils/password.js";

const db = testDb("custedit");
const pool = db.pool;
let app;
let server;
let customerId;
let propertyId;

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
    customerId = await Customer.create(pool, { name: "Ann Lee", phone: "(208) 555-0101", email: "ann@example.com" });
    propertyId = await Property.create(pool, customerId, { street: "12 Oak Street", city: "Rexburg", zip: "83440" });
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
    await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName });
    await send(agent, "/login", "/login", { email, password: "longenough" });
    return agent;
}

const customerPage = () => {
    return `/staff/customers/${customerId}/edit`;
};
const propertyPage = () => {
    return `/staff/properties/${propertyId}/edit`;
};

async function customerRow() {
    const { rows } = await pool.query("SELECT * FROM customers WHERE id = $1", [customerId]);
    return rows[0];
}

async function propertyRow() {
    const { rows } = await pool.query("SELECT * FROM properties WHERE id = $1", [propertyId]);
    return rows[0];
}

test("an owner edits every customer field, and the matching columns follow", async () => {
    const owner = await agentFor("owner");

    const res = await send(owner, customerPage(), customerPage(), {
        name: "Ann Lee-Smith", phone: "208-555-0199", email: "ANN.NEW@Example.com",
    });

    assert.strictEqual(res.status, 303);
    assert.strictEqual(res.headers.location, `/staff/customers/${customerId}`);
    const row = await customerRow();
    assert.deepStrictEqual(
        [row.name, row.name_normalized, row.phone_normalized, row.email],
        ["Ann Lee-Smith", "ann lee smith", "2085550199", "ann.new@example.com"],
    );
});

test("a dispatcher edits contact details but is refused the name, and the form hides it", async () => {
    const dispatcher = await agentFor("dispatcher");

    const form = await dispatcher.get(customerPage());
    assert.strictEqual(form.status, 200);
    assert.ok(!form.text.includes('name="name"'));
    assert.ok(form.text.includes('name="phone"'));

    const ok = await send(dispatcher, customerPage(), customerPage(), { phone: "208-555-0155", email: "" });
    assert.strictEqual(ok.status, 303);
    let row = await customerRow();
    assert.deepStrictEqual([row.name, row.phone, row.email], ["Ann Lee", "208-555-0155", null]);

    const refused = await send(dispatcher, customerPage(), customerPage(), { name: "Hacked", phone: "208-555-0166" });
    assert.strictEqual(refused.status, 403);
    row = await customerRow();
    assert.deepStrictEqual([row.name, row.phone], ["Ann Lee", "208-555-0155"], "a refused post changes nothing");
});

test("a customer, a logged-out visitor and a post without a CSRF token cannot edit", async () => {
    const customer = await agentFor("customer");
    assert.strictEqual((await customer.get(customerPage())).status, 403);
    const forged = await customer.post(customerPage()).type("form").send({ name: "Hacked" });
    assert.strictEqual(forged.status, 403);

    const visitor = await request(server).get(customerPage());
    assert.strictEqual(visitor.status, 302);
    assert.strictEqual(visitor.headers.location, "/login");

    const owner = await agentFor("owner");
    const noToken = await owner.post(customerPage()).type("form").send({ name: "Hacked" });
    assert.strictEqual(noToken.status, 403);
    assert.strictEqual((await customerRow()).name, "Ann Lee");
});

test("a bad value is explained and nothing is saved", async () => {
    const owner = await agentFor("owner");

    const blank = await send(owner, customerPage(), customerPage(), { name: "  ", phone: "208-555-0101" });
    assert.strictEqual(blank.status, 400);
    assert.ok(blank.text.includes("Enter a name of up to 100 characters."));

    const phone = await send(owner, customerPage(), customerPage(), { name: "Ann Lee", phone: "123", email: "nope" });
    assert.strictEqual(phone.status, 400);
    assert.ok(phone.text.includes("Enter a phone number with at least 10 digits, or leave it blank."));
    assert.ok(phone.text.includes("Enter a valid email address, or leave it blank."));
    assert.strictEqual((await customerRow()).phone, "(208) 555-0101");
});

test("an unknown customer or property is a 404", async () => {
    const owner = await agentFor("owner");
    assert.strictEqual((await owner.get("/staff/customers/99999/edit")).status, 404);
    assert.strictEqual((await owner.get("/staff/properties/99999/edit")).status, 404);
    assert.strictEqual((await owner.get("/staff/properties/abc/edit")).status, 404);
});

test("a dispatcher fills in a missing city and ZIP but cannot change the street", async () => {
    await pool.query("UPDATE properties SET city = NULL, zip = NULL WHERE id = $1", [propertyId]);
    const dispatcher = await agentFor("dispatcher");

    const ok = await send(dispatcher, propertyPage(), propertyPage(), { city: "Rexburg", zip: "83440", notes: "Gate code 12" });
    assert.strictEqual(ok.status, 303);
    assert.strictEqual(ok.headers.location, `/staff/customers/${customerId}`);
    let row = await propertyRow();
    assert.deepStrictEqual([row.city, row.zip, row.notes, row.street], ["Rexburg", "83440", "Gate code 12", "12 Oak Street"]);

    const refused = await send(dispatcher, propertyPage(), propertyPage(), { street: "1 Elsewhere Rd", city: "Idaho Falls" });
    assert.strictEqual(refused.status, 403);
    row = await propertyRow();
    assert.deepStrictEqual([row.street, row.city], ["12 Oak Street", "Rexburg"]);
});

test("an owner changes a street and the normalized address follows; a blank street is refused", async () => {
    const owner = await agentFor("owner");

    const ok = await send(owner, propertyPage(), propertyPage(), { street: "99 Elm Avenue", city: "", zip: "" });
    assert.strictEqual(ok.status, 303);
    const row = await propertyRow();
    assert.deepStrictEqual([row.address_normalized, row.city, row.zip], ["99 elm ave", null, null]);

    const blank = await send(owner, propertyPage(), propertyPage(), { street: " ", city: "Rexburg" });
    assert.strictEqual(blank.status, 400);
    assert.ok(blank.text.includes("Enter a street address."));

    const zip = await send(owner, propertyPage(), propertyPage(), { street: "99 Elm Avenue", zip: "12" });
    assert.strictEqual(zip.status, 400);
    assert.ok(zip.text.includes("Enter a valid ZIP code, or leave it blank."));
});

test("staff add a property to a customer, and the city is required for a hand-made one", async () => {
    const dispatcher = await agentFor("dispatcher");
    const page = `/staff/customers/${customerId}`;

    const ok = await send(dispatcher, page, `${page}/properties`, { street: "5 Pine Lane", city: "Rexburg", zip: "83440" });
    assert.strictEqual(ok.status, 303);
    const { rows } = await pool.query("SELECT street, address_normalized FROM properties WHERE customer_id = $1 ORDER BY id", [customerId]);
    assert.deepStrictEqual(rows.map((row) => {
        return row.address_normalized;
    }), ["12 oak st", "5 pine ln"]);

    const missing = await send(dispatcher, page, `${page}/properties`, { street: "6 Pine Lane", city: "" });
    assert.strictEqual(missing.status, 400);
    assert.ok(missing.text.includes("Enter a city."));
    assert.ok(missing.text.includes('value="6 Pine Lane"'), "the typed street is kept");
});

test("the customer list can show only customers with a property missing a city", async () => {
    const other = await Customer.create(pool, { name: "Bo Cityless", phone: "208-555-0300" });
    await Property.create(pool, other, { street: "3 Birch Way", city: null });
    await Customer.create(pool, { name: "Cy Noproperty", phone: "208-555-0400" });
    const dispatcher = await agentFor("dispatcher");

    const all = await dispatcher.get("/staff/customers");
    assert.ok(all.text.includes("Ann Lee") && all.text.includes("Bo Cityless") && all.text.includes("Cy Noproperty"));

    const filtered = await dispatcher.get("/staff/customers?needs=city");
    assert.ok(filtered.text.includes("Bo Cityless"));
    assert.ok(!filtered.text.includes("Ann Lee"));
    assert.ok(!filtered.text.includes("Cy Noproperty"), "no property is not the same as a missing city");
    assert.ok(filtered.text.includes("checked"));

    const page = await dispatcher.get(`/staff/customers/${other}`);
    assert.ok(page.text.includes("(needs a city)"));
});
