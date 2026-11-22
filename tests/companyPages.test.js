import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./helpers/db.js";
import createApp from "../src/app.js";
import * as Company from "../src/models/company.js";
import * as User from "../src/models/user.js";
import * as Customer from "../src/models/customer.js";
import * as Property from "../src/models/property.js";
import * as ServiceRequest from "../src/models/serviceRequest.js";
import * as Review from "../src/models/review.js";
import * as AccessLink from "../src/models/accessLink.js";
import { hashPassword } from "../src/utils/password.js";

// A company's public pages at /w/<slug> (ADR 0018): the same pages as the bare ones, which belong to the first company,
// for the company the slug names. Company 1 is Tuft Sprinkler Blowouts. Company 2 is Acme Lawn, made the way
// `pnpm company:create` makes it, with its own services.

const db = testDb("companypages");
const pool = db.pool;
let app;
let server;
let aeration;
let bo;
let boProperty;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    server?.close();
    app?.locals.sessionStore.close();
    app = createApp({ pool, sessionSecret: "test-secret" });
    server = await new Promise((resolve) => {
        const started = app.listen(0, () => {
            resolve(started);
        });
    });

    const made = await Company.createWithOwner(pool, {
        name: "Acme Lawn", slug: "acme-lawn", ownerEmail: "owner@acme.example",
        ownerPasswordHash: await hashPassword("longenough"),
        services: [{ name: "Aeration", priceCents: 7500 }, { name: "Mulch", priceCents: 0 }],
    });
    aeration = made.serviceIds[0];
    bo = await Customer.create(pool, 2, { name: "Bo Kim", phone: "(208) 555-0202" });
    boProperty = await Property.create(pool, bo, { street: "9 Elm Street", city: "Rigby", zip: "83442" });
});
after(async () => {
    server?.close();
    app?.locals.sessionStore.close();
    await db.close();
});

async function tokenFrom(agent, pagePath) {
    const res = await agent.get(pagePath);
    const found = res.text.match(/name="_csrf" value="([^"]+)"/);

    if (!found) {
        throw new Error(`No CSRF token on GET ${pagePath}: status ${res.status}, body ${res.text.slice(0, 200)}`);
    }

    return found[1];
}

async function send(agent, pagePath, action, fields) {
    const _csrf = await tokenFrom(agent, pagePath);
    return agent.post(action).type("form").send({ _csrf, ...fields });
}

function futureDay(days = 20) {
    return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function count(sql, params = []) {
    return (await pool.query(sql, params)).rows[0].n;
}

const NEW_VISITOR = { name: "Dee Fox", phone: "208-555-0909", address: "5 Birch Lane" };

test("a company's home page shows its own name and services, and an unknown or mis-cased slug is a 404", async () => {
    const agent = request.agent(server);

    const home = await agent.get("/w/acme-lawn");

    assert.strictEqual(home.status, 200);
    assert.match(home.text, /<h1>Acme Lawn<\/h1>/);
    assert.match(home.text, /class="brand" href="\/w\/acme-lawn">Acme Lawn</);
    assert.match(home.text, /Aeration/);
    assert.match(home.text, /\$75\.00/);
    assert.doesNotMatch(home.text, /Sprinkler Blowout/);
    assert.match(home.text, /href="\/w\/acme-lawn\/schedule"/);
    assert.strictEqual((await agent.get("/w/no-such-company")).status, 404);
    assert.strictEqual((await agent.get("/w/ACME-LAWN")).status, 404);
    assert.strictEqual((await agent.get("/w/acme-lawn/nothing-here")).status, 404);
    assert.strictEqual((await agent.get("/w/acme-lawn/staff")).status, 404);

    const bare = await agent.get("/");
    assert.match(bare.text, /class="brand" href="\/">Routemaster</);
    assert.doesNotMatch(bare.text, /Acme Lawn/);
});

test("the services page lists a company's own catalog, with its links under its address", async () => {
    const agent = request.agent(server);

    const acme = await agent.get("/w/acme-lawn/services");
    const bare = await agent.get("/services");

    assert.match(acme.text, /Aeration/);
    assert.match(acme.text, /Mulch/);
    assert.doesNotMatch(acme.text, /Sprinkler Blowout/);
    assert.match(acme.text, /href="\/w\/acme-lawn\/schedule"/);
    assert.match(acme.text, /href="\/w\/acme-lawn\/contact"/);
    assert.match(bare.text, /Sprinkler Blowout/);
    assert.doesNotMatch(bare.text, /Aeration/);
    assert.match(bare.text, /href="\/schedule"/);
});

test("a request made on a company's schedule page is that company's, and the bare page is still the first company's", async () => {
    const agent = request.agent(server);

    const identified = await send(agent, "/w/acme-lawn/schedule", "/w/acme-lawn/schedule", NEW_VISITOR);
    assert.strictEqual(identified.headers.location, "/w/acme-lawn/schedule/date");
    const form = await agent.get("/w/acme-lawn/schedule/date");
    assert.match(form.text, /Aeration/);
    assert.doesNotMatch(form.text, /Sprinkler Blowout/);
    assert.match(form.text, /action="\/w\/acme-lawn\/schedule\/date"/);

    const submitted = await send(agent, "/w/acme-lawn/schedule/date", "/w/acme-lawn/schedule/date", {
        serviceTypeId: aeration, preferredDate: futureDay(),
    });

    assert.strictEqual(submitted.headers.location, "/w/acme-lawn/schedule/thanks");
    assert.strictEqual((await agent.get("/w/acme-lawn/schedule/thanks")).status, 200);
    const lead = await pool.query("SELECT company_id FROM leads WHERE name = 'Dee Fox'");
    const made = await pool.query(
        "SELECT company_id, service_type_id, customer_id FROM service_requests WHERE lead_id IS NOT NULL",
    );
    assert.deepStrictEqual(lead.rows, [{ company_id: 2 }]);
    assert.deepStrictEqual(made.rows, [{ company_id: 2, service_type_id: aeration, customer_id: null }]);

    // The same on the bare page goes to company 1.
    const bare = request.agent(server);
    const first = await send(bare, "/schedule", "/schedule", { ...NEW_VISITOR, name: "Eve Ray" });
    assert.strictEqual(first.headers.location, "/schedule/date");
    await send(bare, "/schedule/date", "/schedule/date", { serviceTypeId: 1, preferredDate: futureDay() });
    assert.deepStrictEqual((await pool.query("SELECT company_id FROM leads WHERE name = 'Eve Ray'")).rows, [{ company_id: 1 }]);
    assert.strictEqual(await count("SELECT count(*)::int AS n FROM leads"), 2);
});

test("a customer is matched in the company whose page they used, and only there", async () => {
    const onCompanyPage = request.agent(server);
    const onBarePage = request.agent(server);
    const bos = { name: "Bo Kim", phone: "208-555-0202", address: "9 Elm Street" };

    await send(onCompanyPage, "/w/acme-lawn/schedule", "/w/acme-lawn/schedule", bos);
    await send(onCompanyPage, "/w/acme-lawn/schedule/date", "/w/acme-lawn/schedule/date", {
        serviceTypeId: aeration, preferredDate: futureDay(),
    });
    await send(onBarePage, "/schedule", "/schedule", bos);
    await send(onBarePage, "/schedule/date", "/schedule/date", { serviceTypeId: 1, preferredDate: futureDay() });

    const matched = await pool.query("SELECT customer_id, company_id FROM service_requests WHERE company_id = 2");
    const unmatched = await pool.query("SELECT customer_id, lead_id, company_id FROM service_requests WHERE company_id = 1");
    assert.deepStrictEqual(matched.rows, [{ customer_id: bo, company_id: 2 }]);
    assert.strictEqual(unmatched.rows.length, 1);
    assert.strictEqual(unmatched.rows[0].customer_id, null, "Bo is not a customer of company 1, so the bare page found no match");
    assert.ok(unmatched.rows[0].lead_id);
});

test("a schedule flow started on one company's page cannot be finished on another's", async () => {
    const agent = request.agent(server);
    await send(agent, "/schedule", "/schedule", NEW_VISITOR);

    const date = await agent.get("/w/acme-lawn/schedule/date");
    const submit = await send(agent, "/w/acme-lawn/schedule", "/w/acme-lawn/schedule/date", {
        serviceTypeId: aeration, preferredDate: futureDay(),
    });

    assert.strictEqual(date.status, 302);
    assert.strictEqual(date.headers.location, "/w/acme-lawn/schedule");
    assert.strictEqual(submit.headers.location, "/w/acme-lawn/schedule");
    assert.strictEqual(await count("SELECT count(*)::int AS n FROM service_requests"), 0);

    // And the other way round.
    const other = request.agent(server);
    await send(other, "/w/acme-lawn/schedule", "/w/acme-lawn/schedule", NEW_VISITOR);
    assert.strictEqual((await other.get("/schedule/date")).headers.location, "/schedule");
});

test("a service of another company is refused on a company's schedule page", async () => {
    const agent = request.agent(server);
    await send(agent, "/w/acme-lawn/schedule", "/w/acme-lawn/schedule", NEW_VISITOR);

    const res = await send(agent, "/w/acme-lawn/schedule/date", "/w/acme-lawn/schedule/date", {
        serviceTypeId: 1, preferredDate: futureDay(),
    });

    assert.strictEqual(res.status, 400);
    assert.match(res.text, /Choose a service/);
    assert.strictEqual(await count("SELECT count(*)::int AS n FROM service_requests"), 0);
});

test("the reviews page shows only the company's own reviews", async () => {
    const request2 = await ServiceRequest.create(pool, 2, {
        customerId: bo, propertyId: boProperty, serviceTypeId: aeration, preferredDate: futureDay(),
    });
    await pool.query(
        "UPDATE service_requests SET status_id = (SELECT id FROM request_statuses WHERE name = 'Completed') WHERE id = $1",
        [request2],
    );
    await Review.save(pool, { requestId: request2, customerId: bo, rating: 5, body: "Acme did a lovely job" });
    const agent = request.agent(server);

    const acme = await agent.get("/w/acme-lawn/reviews");
    const bare = await agent.get("/reviews");

    assert.match(acme.text, /Acme did a lovely job/);
    assert.doesNotMatch(bare.text, /Acme did a lovely job/);
    assert.match(bare.text, /No reviews yet/);
});

test("a contact message goes to the company whose page it was sent from", async () => {
    const agent = request.agent(server);
    const form = await agent.get("/w/acme-lawn/contact");
    assert.match(form.text, /action="\/w\/acme-lawn\/contact"/);

    const sent = await send(agent, "/w/acme-lawn/contact", "/w/acme-lawn/contact", {
        name: "Rae", email: "rae@example.com", phone: "", message: "Hello Acme",
    });
    await send(agent, "/contact", "/contact", { name: "Sol", email: "sol@example.com", phone: "", message: "Hello Tuft" });

    assert.strictEqual(sent.status, 200);
    assert.match(sent.text, /Message Sent/);
    assert.deepStrictEqual((await pool.query("SELECT name, company_id FROM contact_messages ORDER BY id")).rows, [
        { name: "Rae", company_id: 2 }, { name: "Sol", company_id: 1 },
    ]);
});

test("registering on a company's page makes a customer of that company, who lands on that company's home page", async () => {
    const agent = request.agent(server);
    const page = await agent.get("/w/acme-lawn/register");
    assert.match(page.text, /action="\/w\/acme-lawn\/register"/);

    const res = await send(agent, "/w/acme-lawn/register", "/w/acme-lawn/register", {
        email: "cust@example.com", password: "longenough", confirm: "longenough",
    });
    const bare = await send(request.agent(server), "/register", "/register", {
        email: "other@example.com", password: "longenough", confirm: "longenough",
    });

    assert.strictEqual(res.headers.location, "/w/acme-lawn");
    assert.strictEqual(bare.headers.location, "/");
    assert.deepStrictEqual(
        (await pool.query("SELECT email, company_id FROM users WHERE email IN ('cust@example.com', 'other@example.com') ORDER BY email")).rows,
        [{ email: "cust@example.com", company_id: 2 }, { email: "other@example.com", company_id: 1 }],
    );
    // An email is one login in one company, so it cannot be registered again on the other company's page.
    const again = await send(request.agent(server), "/register", "/register", {
        email: "cust@example.com", password: "longenough", confirm: "longenough",
    });
    assert.strictEqual(again.status, 400);
    assert.match(again.text, /already registered/);
});

test("logging in lands a user on their own company's home page, and the login page leads to that company's register page", async () => {
    await User.create(pool, { companyId: 1, email: "owner@tuft.example", passwordHash: await hashPassword("longenough"), roleName: "owner" });
    const acme = request.agent(server);
    const tuft = request.agent(server);

    const acmeLogin = await send(acme, "/login", "/login", { email: "owner@acme.example", password: "longenough" });
    const tuftLogin = await send(tuft, "/login", "/login", { email: "owner@tuft.example", password: "longenough" });
    const bareForm = await request.agent(server).get("/login");
    const acmeForm = await request.agent(server).get("/w/acme-lawn/login");

    assert.strictEqual(acmeLogin.headers.location, "/w/acme-lawn");
    assert.strictEqual(tuftLogin.headers.location, "/");
    assert.match(bareForm.text, /href="\/register"/);
    assert.match(acmeForm.text, /href="\/w\/acme-lawn\/register"/);
    assert.match(acmeForm.text, /action="\/login"/);
});

test("a logged-in company's staff see their company's name and public links on a staff page", async () => {
    await User.create(pool, { companyId: 1, email: "owner@tuft.example", passwordHash: await hashPassword("longenough"), roleName: "owner" });
    const acme = request.agent(server);
    const tuft = request.agent(server);
    await send(acme, "/login", "/login", { email: "owner@acme.example", password: "longenough" });
    await send(tuft, "/login", "/login", { email: "owner@tuft.example", password: "longenough" });

    const acmePage = await acme.get("/staff");
    const tuftPage = await tuft.get("/staff");

    assert.match(acmePage.text, /class="brand" href="\/w\/acme-lawn">Acme Lawn</);
    assert.match(acmePage.text, /href="\/w\/acme-lawn\/services"/);
    assert.match(tuftPage.text, /class="brand" href="\/">Routemaster</);
    assert.match(tuftPage.text, /href="\/services"/);
});

test("an expired link sends a customer to their own company's schedule page", async () => {
    const acmeLink = await AccessLink.createWithId(pool, { customerId: bo });
    await AccessLink.revoke(pool, acmeLink.id);
    const ann = await Customer.create(pool, 1, { name: "Ann Lee", phone: "(208) 555-0101" });
    const tuftLink = await AccessLink.createWithId(pool, { customerId: ann });
    await AccessLink.revoke(pool, tuftLink.id);
    const agent = request.agent(server);

    const acme = await agent.get(`/l/${acmeLink.token}`);
    const tuft = await agent.get(`/l/${tuftLink.token}`);
    const unknown = await agent.get("/l/not-a-real-token");

    assert.strictEqual(acme.status, 404);
    assert.match(acme.text, /href="\/w\/acme-lawn\/schedule"/);
    assert.match(tuft.text, /href="\/schedule"/);
    assert.match(unknown.text, /href="\/schedule"/);
});

test("a missing page under a company keeps its links under that company", async () => {
    const res = await request.agent(server).get("/w/acme-lawn/nothing-here");

    assert.strictEqual(res.status, 404);
    assert.match(res.text, /href="\/w\/acme-lawn\/services"/);
    assert.match(res.text, /class="brand" href="\/w\/acme-lawn">Acme Lawn</);
});
