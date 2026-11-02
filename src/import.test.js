import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import ExcelJS from "exceljs";
import { testDb } from "./test/db.js";
import createApp from "./app.js";
import * as User from "./models/user.js";
import * as Customer from "./models/customer.js";
import * as Property from "./models/property.js";
import { hashPassword } from "./utils/password.js";
import { SpreadsheetImportError } from "./import/errors.js";

const db = testDb("import");
const pool = db.pool;
const fixture = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "import", "fixtures", "tiny.xlsx"));
const LINK = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit";

let app;
let server;
let fetchSheet;
let fetchCalls;

function listen(application) {
    return new Promise((resolve) => {
        const started = application.listen(0, () => {
            resolve(started);
        });
    });
}

async function start(options = {}) {
    server?.close();
    app?.locals.sessionStore.close();
    app = createApp({
        pool,
        sessionSecret: "test-secret",
        fetchSheet: (link) => {
            fetchCalls.push(link);
            return fetchSheet(link);
        },
        ...options,
    });
    server = await listen(app);
}

before(() => {return db.reset();});
beforeEach(async () => {
    await db.reset();
    fetchCalls = [];
    fetchSheet = async () => {return { bytes: fixture };};
    await start();
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

async function loginAs(agent, role) {
    const email = `${role}@example.com`;
    await User.create(pool, { email, passwordHash: await hashPassword("longenough"), roleName: role });
    const _csrf = await tokenFrom(agent, "/login");
    await agent.post("/login").type("form").send({ _csrf, email, password: "longenough" });
}

async function ownerAgent() {
    const agent = request.agent(server);
    await loginAs(agent, "owner");
    return agent;
}

async function submit(agent, link = LINK) {
    const _csrf = await tokenFrom(agent, "/admin/import");
    return agent.post("/admin/import").type("form").send({ _csrf, link });
}

test("the import page sends a visitor to log in and refuses a dispatcher and a customer", async () => {
    const visitor = await request(server).get("/admin/import");
    assert.strictEqual(visitor.status, 302);
    assert.strictEqual(visitor.headers.location, "/login");

    const visitorPost = await request(server).post("/admin/import").type("form").send({ link: LINK });
    assert.strictEqual(visitorPost.status, 403);

    for (const role of ["dispatcher", "customer"]) {
        const agent = request.agent(server);
        await loginAs(agent, role);
        assert.strictEqual((await agent.get("/admin/import")).status, 403, role);
        assert.strictEqual((await agent.post("/admin/import").type("form").send({ link: LINK })).status, 403, role);
    }

    assert.strictEqual(fetchCalls.length, 0);
});

test("a post without a CSRF token is refused and never reaches Google", async () => {
    const agent = await ownerAgent();
    const res = await agent.post("/admin/import").type("form").send({ link: LINK });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(fetchCalls.length, 0);
});

test("the owner sees the form and a link in the nav", async () => {
    const agent = await ownerAgent();
    const res = await agent.get("/admin/import");
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /name="link"/);
    assert.match(res.text, /href="\/admin\/import"/);
});

test("a good link lists each sheet with its row and column counts", async () => {
    const agent = await ownerAgent();
    const res = await submit(agent);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(fetchCalls, [LINK]);
    assert.match(res.text, /Sheets Found/);
    assert.match(res.text, /<td>Jobs<\/td><td>2<\/td><td>3<\/td>/);
});

test("import errors re-render with a safe message and never echo the link", async () => {
    const cases = [
        ["invalid_link", 400, "That link is not a Google Sheet link."],
        ["not_public", 400, "That sheet is private."],
        ["too_large", 400, "That file is too large."],
        ["timeout", 502, "Google took too long."],
        ["network", 502, "Google could not be reached."],
    ];
    const agent = await ownerAgent();

    for (const [code, status, message] of cases) {
        fetchSheet = async () => {
            throw new SpreadsheetImportError(code, message);
        };
        const res = await submit(agent, `${LINK}?secret=abc`);
        assert.strictEqual(res.status, status, code);
        assert.ok(res.text.includes(message), code);
        assert.ok(res.text.includes("secret=abc") === false, code);
        assert.ok(res.text.includes("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms") === false, code);
    }
});

test("an unexpected error goes to the global handler, not the page", async () => {
    fetchSheet = async () => {
        throw new Error("boom with internal detail");
    };
    const agent = await ownerAgent();
    const res = await submit(agent);
    assert.strictEqual(res.status, 500);
    assert.ok(res.text.includes("boom with internal detail") === false);
});

test("a bad workbook from Google is a 400 from the parser", async () => {
    fetchSheet = async () => {return { bytes: Buffer.from("PK\x03\x04 not really a workbook") };};
    const agent = await ownerAgent();
    const res = await submit(agent);
    assert.strictEqual(res.status, 400);
});

test("import posts count against the shared per-IP limit", async () => {
    // The login post spends one of the three, so exactly two import posts fit.
    await start({ rateLimitMax: 3 });
    const agent = await ownerAgent();
    assert.strictEqual((await submit(agent)).status, 200);
    assert.strictEqual((await submit(agent)).status, 200);
    assert.strictEqual((await submit(agent)).status, 429);
});

const SHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
const MAPPING = {
    sheetId: SHEET_ID, sheet: "Fall", headerRow: "1", seasonYear: "2025",
    col_name: "0", col_phone: "1", col_street: "2", col_date: "3", col_amount: "4",
    serviceTypeId: "1", statusName: "Completed", defaultCity: "Testville",
};

async function workbookBytes(rows) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Fall");
    rows.forEach((row) => {
        sheet.addRow(row);
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
}

const JOB_ROWS = [
    ["Name", "Phone", "Street", "Date", "Amount"],
    ["Ada Example", "801-555-0100", "1 Test Street", "10/14", "$45"],
    ["Bob New", "801-555-0111", "2 Test St", "10/15", "50"],
    ["Cy Other", "801-555-0199", "1 Test St", "10/16", "45"],
    ["Dee Nostreet", null, null, null, null],
    ["Eve Known", "801-555-0122", "7 New Rd", "10/17", "45"],
];

async function stepPost(agent, action, fields) {
    const _csrf = await tokenFrom(agent, "/admin/import");
    return agent.post(action).type("form").send({ _csrf, ...fields });
}

async function counts() {
    const customers = await pool.query("SELECT count(*)::int AS n FROM customers");
    const properties = await pool.query("SELECT count(*)::int AS n FROM properties");
    return [customers.rows[0].n, properties.rows[0].n];
}

test("the sheet list carries only the sheet id forward, not what was pasted", async () => {
    const agent = await ownerAgent();
    const res = await submit(agent, `${LINK}?secret=abc#gid=0`);
    assert.ok(res.text.includes(`name="sheetId" value="${SHEET_ID}"`));
    assert.ok(res.text.includes("secret=abc") === false);
    assert.match(res.text, /<button type="submit">Choose<\/button>/);
});

test("the mapping and preview steps are owner only, need CSRF, and never reach Google otherwise", async () => {
    const owner = await ownerAgent();
    const others = {};
    for (const role of ["dispatcher", "customer"]) {
        others[role] = request.agent(server);
        await loginAs(others[role], role);
    }

    for (const action of ["/admin/import/mapping", "/admin/import/preview"]) {
        const visitor = await request(server).post(action).type("form").send(MAPPING);
        assert.strictEqual(visitor.status, 403, action);

        for (const [role, agent] of Object.entries(others)) {
            assert.strictEqual((await stepPost(agent, action, MAPPING)).status, 403, `${role} ${action}`);
        }

        assert.strictEqual((await owner.post(action).type("form").send(MAPPING)).status, 403, `no token ${action}`);
    }

    assert.strictEqual(fetchCalls.length, 0);
});

test("choosing a sheet shows its columns with their headers and sample values", async () => {
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();

    const res = await stepPost(agent, "/admin/import/mapping", { sheetId: SHEET_ID, sheet: "Fall" });

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /A: Name \(Ada Example, Bob New, Cy Other\)/);
    assert.match(res.text, /name="headerRow"[^>]*value="1"/);
    assert.strictEqual(fetchCalls[0], `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);
});

test("tampered hidden fields are refused with a fixed message", async () => {
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();

    const badId = await stepPost(agent, "/admin/import/mapping", { sheetId: "../../evil", sheet: "Fall" });
    assert.strictEqual(badId.status, 400);
    assert.strictEqual(fetchCalls.length, 0);

    const badSheet = await stepPost(agent, "/admin/import/mapping", { sheetId: SHEET_ID, sheet: "<b>Nope</b>" });
    assert.strictEqual(badSheet.status, 400);
    assert.ok(badSheet.text.includes("Choose a sheet from the list."));
    assert.ok(badSheet.text.includes("<b>Nope</b>") === false);

    const badRow = await stepPost(agent, "/admin/import/mapping", { sheetId: SHEET_ID, sheet: "Fall", headerRow: "99" });
    assert.strictEqual(badRow.status, 400);

    const badColumn = await stepPost(agent, "/admin/import/preview", { ...MAPPING, col_phone: "40" });
    assert.strictEqual(badColumn.status, 400);
    assert.ok(badColumn.text.includes("Choose a column from the list for Phone."));
    assert.match(badColumn.text, /Map Columns/, "the owner is sent back to the mapping form");
});

test("a column used twice and a missing required field are explained on the mapping form", async () => {
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();

    const twice = await stepPost(agent, "/admin/import/preview", { ...MAPPING, col_phone: "0" });
    assert.strictEqual(twice.status, 400);
    assert.ok(twice.text.includes("Each column can be used for only one field."));

    const missing = await stepPost(agent, "/admin/import/preview", { ...MAPPING, col_street: "" });
    assert.ok(missing.text.includes("Choose a column for Street Address."));
});

test("the preview sorts rows into outcomes and writes nothing", async () => {
    const ada = await Customer.create(pool, { name: "Ada Example", phone: "(801) 555-0100" });
    await Property.create(pool, ada, { street: "1 Test St", city: "Testville" });
    const eve = await Customer.create(pool, { name: "Eve Known", phone: "801-555-0122" });
    await Property.create(pool, eve, { street: "9 Elsewhere Ave", city: "Testville" });
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();
    const before = await counts();

    const res = await stepPost(agent, "/admin/import/preview", MAPPING);

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /5 rows read, 0 empty rows skipped/);
    assert.match(res.text, /1 cannot be imported/);
    assert.match(res.text, /1 need a decision/);
    assert.match(res.text, /1 are known customers at a new street/);
    assert.match(res.text, /1 are new customers/);
    assert.match(res.text, /1 match a customer and street already on file/);
    assert.match(res.text, /Needs a Decision \(1\)/);
    assert.match(res.text, /<td>2025-10-14<\/td>/);
    assert.match(res.text, /<td>\$45\.00<\/td>/);
    assert.match(res.text, /Missing street address\./);
    assert.deepStrictEqual(await counts(), before);
    assert.match(res.text, /Nothing has been saved yet/);
});

test("the preview keeps the mapping so Change Mapping returns to the same choices", async () => {
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();

    const preview = await stepPost(agent, "/admin/import/preview", MAPPING);
    assert.ok(preview.text.includes('name="col_street" value="2"'));
    assert.ok(preview.text.includes('name="seasonYear" value="2025"'));

    const back = await stepPost(agent, "/admin/import/mapping", { ...MAPPING });
    assert.match(back.text, /<option value="2" selected>/);
});

test("cell text is escaped in the preview and the import pages are never cached", async () => {
    fetchSheet = async () => {return {
        bytes: await workbookBytes([JOB_ROWS[0], ["<script>alert(1)</script>", null, "4 Test St", null, null]]),
    };};
    const agent = await ownerAgent();

    const res = await stepPost(agent, "/admin/import/preview", MAPPING);

    assert.ok(res.text.includes("<script>alert(1)") === false);
    assert.ok(res.text.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.strictEqual(res.headers["cache-control"], "no-store");
    assert.strictEqual((await agent.get("/admin/import")).headers["cache-control"], "no-store");
});

test("an empty sheet is explained instead of crashing", async () => {
    fetchSheet = async () => {return { bytes: await workbookBytes([]) };};
    const agent = await ownerAgent();
    const res = await stepPost(agent, "/admin/import/mapping", { sheetId: SHEET_ID, sheet: "Fall" });
    assert.strictEqual(res.status, 400);
    assert.ok(res.text.includes("That sheet has no rows."));
});

function hashFrom(page) {
    return page.text.match(/name="planHash" value="([0-9a-f]{64})"/)[1];
}

async function seedAda() {
    const ada = await Customer.create(pool, { name: "Ada Example", phone: "(801) 555-0100" });
    await Property.create(pool, ada, { street: "1 Test St", city: "Testville" });
}

test("the preview says what confirming would do and offers a confirm form with the plan hash", async () => {
    await seedAda();
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();

    const res = await stepPost(agent, "/admin/import/preview", MAPPING);

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /2 new customers and 2 new properties/);
    assert.match(res.text, /3 jobs, each dated by its own day and marked Completed/);
    assert.match(res.text, /Skipped: 1 with no name or street, 1 on another customer(?:'|&#39;)s street/);
    assert.doesNotMatch(res.text, /have no city/);
    assert.match(res.text, /action="\/admin\/import\/confirm"/);
    assert.ok(res.text.includes('name="serviceTypeId" value="1"'));
    assert.ok(res.text.includes('name="defaultCity" value="Testville"'));
    hashFrom(res);
    assert.deepStrictEqual(await counts(), [1, 1], "the preview still writes nothing");
});

test("a missing or unknown service type, status, or an over-long default city is explained on the form", async () => {
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();

    const type = await stepPost(agent, "/admin/import/preview", { ...MAPPING, serviceTypeId: "999" });
    assert.strictEqual(type.status, 400);
    assert.ok(type.text.includes("Choose a service type from the list."));

    const status = await stepPost(agent, "/admin/import/preview", { ...MAPPING, statusName: "Needs Review" });
    assert.ok(status.text.includes("Choose a status from the list."));

    const city = await stepPost(agent, "/admin/import/preview", { ...MAPPING, defaultCity: "x".repeat(101) });
    assert.ok(city.text.includes("Default city must be at most 100 characters."));
    assert.match(city.text, /Map Columns/);
});

test("confirming writes the import and redirects to a result page that survives a refresh", async () => {
    await seedAda();
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();
    const preview = await stepPost(agent, "/admin/import/preview", MAPPING);

    const res = await stepPost(agent, "/admin/import/confirm", { ...MAPPING, planHash: hashFrom(preview) });

    assert.strictEqual(res.status, 303);
    assert.match(res.headers.location, /^\/admin\/import\/batches\/\d+$/);
    assert.deepStrictEqual(await counts(), [3, 3]);
    const jobs = await pool.query("SELECT count(*)::int AS n FROM service_requests WHERE import_batch_id IS NOT NULL");
    assert.strictEqual(jobs.rows[0].n, 3);

    for (let visit = 0; visit < 2; visit += 1) {
        const page = await agent.get(res.headers.location);
        assert.strictEqual(page.status, 200);
        assert.match(page.text, /Import Complete/);
        assert.match(page.text, /2 customers created/);
        assert.match(page.text, /3 jobs created/);
        assert.match(page.text, /owner@example\.com/);
        assert.strictEqual(page.headers["cache-control"], "no-store");
    }
});

test("a sheet with no city is flagged on the preview, imported with the street alone, and flagged again after", async () => {
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();
    const fields = { ...MAPPING, defaultCity: "" };

    const preview = await stepPost(agent, "/admin/import/preview", fields);
    assert.match(preview.text, /4 new properties have no city/);

    const res = await stepPost(agent, "/admin/import/confirm", { ...fields, planHash: hashFrom(preview) });
    assert.strictEqual(res.status, 303);

    const cityless = await pool.query("SELECT count(*)::int AS n FROM properties WHERE city IS NULL");
    assert.strictEqual(cityless.rows[0].n, 4);
    const page = await agent.get(res.headers.location);
    assert.match(page.text, /4 of the new properties have no city/);
});

test("confirming from a stale preview writes nothing and shows a fresh preview", async () => {
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();
    const preview = await stepPost(agent, "/admin/import/preview", MAPPING);
    const hash = hashFrom(preview);

    fetchSheet = async () => {return { bytes: await workbookBytes([...JOB_ROWS, ["Fay Added", null, "8 Test St", "10/18", "45"]]) };};
    const changedSheet = await stepPost(agent, "/admin/import/confirm", { ...MAPPING, planHash: hash });
    assert.strictEqual(changedSheet.status, 409);
    assert.ok(changedSheet.text.includes("The sheet or the data changed since this preview."));
    assert.match(changedSheet.text, /Confirm Import/);
    assert.notStrictEqual(hashFrom(changedSheet), hash);

    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    await Customer.create(pool, { name: "Bob New", phone: "801-555-0111" });
    const changedData = await stepPost(agent, "/admin/import/confirm", { ...MAPPING, planHash: hash });
    assert.strictEqual(changedData.status, 409);

    const garbage = await stepPost(agent, "/admin/import/confirm", { ...MAPPING, planHash: "<b>nope</b>" });
    assert.strictEqual(garbage.status, 409);
    assert.ok(garbage.text.includes("<b>nope</b>") === false);

    assert.deepStrictEqual(await counts(), [1, 0], "only the customer the test added by hand");
});

test("submitting the same confirm twice imports once", async () => {
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();
    const preview = await stepPost(agent, "/admin/import/preview", MAPPING);
    const fields = { ...MAPPING, planHash: hashFrom(preview) };

    const first = await stepPost(agent, "/admin/import/confirm", fields);
    const second = await stepPost(agent, "/admin/import/confirm", fields);

    assert.strictEqual(first.status, 303);
    assert.strictEqual(second.status, 409);
    assert.deepStrictEqual(await counts(), [4, 4]);
});

test("a sheet with nothing new offers no confirm button", async () => {
    fetchSheet = async () => {return { bytes: await workbookBytes([JOB_ROWS[0]]) };};
    const agent = await ownerAgent();

    const res = await stepPost(agent, "/admin/import/preview", MAPPING);

    assert.ok(res.text.includes("There is nothing new to import."));
    assert.ok(res.text.includes("/admin/import/confirm") === false);
});

test("confirm and the result page are owner only, and confirm needs CSRF", async () => {
    const owner = await ownerAgent();
    const dispatcher = request.agent(server);
    await loginAs(dispatcher, "dispatcher");

    assert.strictEqual((await stepPost(dispatcher, "/admin/import/confirm", MAPPING)).status, 403);
    assert.strictEqual((await dispatcher.get("/admin/import/batches/1")).status, 403);
    assert.strictEqual((await request(server).post("/admin/import/confirm").type("form").send(MAPPING)).status, 403);
    assert.strictEqual((await owner.post("/admin/import/confirm").type("form").send(MAPPING)).status, 403);
    assert.strictEqual((await request(server).get("/admin/import/batches/1")).status, 302);
    assert.strictEqual((await owner.get("/admin/import/batches/999")).status, 404);
    assert.strictEqual((await owner.get("/admin/import/batches/abc")).status, 404);
    assert.strictEqual(fetchCalls.length, 0);
});

test("choosing the same tab again starts from the mapping saved at the last import", async () => {
    fetchSheet = async () => {return { bytes: await workbookBytes(JOB_ROWS) };};
    const agent = await ownerAgent();
    const preview = await stepPost(agent, "/admin/import/preview", { ...MAPPING, statusName: "Scheduled" });
    await stepPost(agent, "/admin/import/confirm", { ...MAPPING, statusName: "Scheduled", planHash: hashFrom(preview) });

    const res = await stepPost(agent, "/admin/import/mapping", { sheetId: SHEET_ID, sheet: "Fall" });

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /<option value="2" selected>/);
    assert.match(res.text, /<option value="1" selected>/);
    assert.match(res.text, /<option value="Scheduled" selected>/);
    assert.ok(res.text.includes('value="Testville"'));
});
