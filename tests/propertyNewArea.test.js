import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./helpers/db.js";
import createApp from "../src/app.js";
import * as User from "../src/models/user.js";
import * as Customer from "../src/models/customer.js";
import * as Property from "../src/models/property.js";
import * as Area from "../src/models/area.js";
import { hashPassword } from "../src/utils/password.js";

const db = testDb("propnewarea");
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
    customerId = await Customer.create(pool, 1, { name: "Ann Lee", phone: "(208) 555-0101", email: "ann@example.com" });
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
    await User.create(pool, { companyId: 1, email, passwordHash: await hashPassword("longenough"), roleName });
    await send(agent, "/login", "/login", { email, password: "longenough" });
    return agent;
}

const propertyPage = () => {
    return `/staff/properties/${propertyId}/edit`;
};

async function propertyRow() {
    const { rows } = await pool.query("SELECT * FROM properties WHERE id = $1", [propertyId]);
    return rows[0];
}

async function areaRows() {
    const { rows } = await pool.query("SELECT id, name, company_id FROM subdivisions ORDER BY id");
    return rows;
}

// The fields a dispatcher's browser sends. The street is the owner's alone, so the form does not show it to them.
function form(overrides) {
    return { city: "Rexburg", zip: "83440", notes: "", subdivisionId: "", newAreaName: "", ...overrides };
}

test("the edit page offers No area/Other and a New Area field", async () => {
    const dispatcher = await agentFor("dispatcher");
    const page = await dispatcher.get(propertyPage());

    assert.strictEqual(page.status, 200);
    assert.match(page.text, /<option value="">No area\/Other<\/option>/);
    assert.match(page.text, /data-new-area/);
    assert.match(page.text, /name="newAreaName"/);
});

test("a dispatcher types a new area: it is made in their company and the property is put in it", async () => {
    const dispatcher = await agentFor("dispatcher");
    const res = await send(dispatcher, propertyPage(), propertyPage(), form({ newAreaName: "  Maple Grove " }));

    assert.strictEqual(res.status, 303);
    assert.strictEqual(res.headers.location, `/staff/customers/${customerId}`);

    const areas = await areaRows();
    assert.deepStrictEqual(areas.map((area) => {
        return [area.name, area.company_id];
    }), [["Maple Grove", 1]]);
    assert.strictEqual((await propertyRow()).subdivision_id, areas[0].id);
});

test("a typed name replaces the area chosen in the list", async () => {
    const dispatcher = await agentFor("dispatcher");
    const existing = await Area.create(pool, 1, "Oakwood");
    const res = await send(dispatcher, propertyPage(), propertyPage(), form({ subdivisionId: String(existing), newAreaName: "Pine Hills" }));
    const areas = await areaRows();
    const pine = areas.find((area) => {
        return area.name === "Pine Hills";
    });

    assert.strictEqual(res.status, 303);
    assert.strictEqual(areas.length, 2);
    assert.strictEqual((await propertyRow()).subdivision_id, pine.id);
});

test("a blank new area leaves the list choice alone, and No area/Other still clears the area", async () => {
    const dispatcher = await agentFor("dispatcher");
    const existing = await Area.create(pool, 1, "Oakwood");

    await send(dispatcher, propertyPage(), propertyPage(), form({ subdivisionId: String(existing), newAreaName: "   " }));
    assert.strictEqual((await propertyRow()).subdivision_id, existing);

    await send(dispatcher, propertyPage(), propertyPage(), form({ subdivisionId: "" }));
    assert.strictEqual((await propertyRow()).subdivision_id, null);
    assert.strictEqual((await areaRows()).length, 1);
});

test("a name that is already an area, in any case, is refused and nothing changes", async () => {
    const dispatcher = await agentFor("dispatcher");
    await Area.create(pool, 1, "Oakwood");
    const res = await send(dispatcher, propertyPage(), propertyPage(), form({ newAreaName: " OAKWOOD " }));

    assert.strictEqual(res.status, 400);
    assert.match(res.text, /An area with that name already exists\. Choose it from the list\./);
    assert.match(res.text, /name="newAreaName" value="OAKWOOD"/);
    assert.strictEqual((await areaRows()).length, 1);
    assert.strictEqual((await propertyRow()).subdivision_id, null);
});

test("a name that is too long is refused and no area is made", async () => {
    const dispatcher = await agentFor("dispatcher");
    const res = await send(dispatcher, propertyPage(), propertyPage(), form({ newAreaName: "A".repeat(81) }));

    assert.strictEqual(res.status, 400);
    assert.match(res.text, /Enter an area name of up to 80 characters\./);
    assert.strictEqual((await areaRows()).length, 0);
});

test("a bad ZIP with a new area name makes no area, and the typed name stays in the form", async () => {
    const dispatcher = await agentFor("dispatcher");
    const res = await send(dispatcher, propertyPage(), propertyPage(), form({ zip: "abc", newAreaName: "Maple Grove" }));

    assert.strictEqual(res.status, 400);
    assert.match(res.text, /Enter a valid ZIP code/);
    assert.match(res.text, /name="newAreaName" value="Maple Grove"/);
    assert.strictEqual((await areaRows()).length, 0);
    assert.strictEqual((await propertyRow()).subdivision_id, null);
});

test("a customer cannot create an area through the property page", async () => {
    const customer = await agentFor("customer");
    const res = await send(customer, "/login", propertyPage(), form({ newAreaName: "Sneaky" }));

    assert.strictEqual(res.status, 403);
    assert.strictEqual((await areaRows()).length, 0);
});
