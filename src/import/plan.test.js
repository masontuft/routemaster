import { test } from "node:test";
import assert from "node:assert";
import { buildPlan } from "./plan.js";
import { parseOptions } from "./options.js";

const OPTIONS = { serviceTypeId: 1, statusName: "Completed", defaultCity: "" };
const CONTEXT = { sheetId: "sheet-1", sheetName: "Fall", seasonYear: 2025 };

function row(rowNumber, fields = {}, match = { kind: "new", customerId: null, propertyId: null }) {
    return {
        rowNumber,
        name: "Ada Example",
        phone: "801-555-0100",
        street: "1 Test Street",
        city: "Testville",
        zip: null,
        date: "2025-10-14",
        amountCents: 4500,
        area: null,
        notes: null,
        issues: [],
        blocked: false,
        groupSize: 1,
        match,
        ...fields,
    };
}

function plan(rows, options = OPTIONS) {
    return buildPlan(rows, options, CONTEXT);
}

test("blocked and flagged rows are skipped with a reason", () => {
    const result = plan([
        row(2, {}, { kind: "blocked", customerId: null, propertyId: null }),
        row(3, {}, { kind: "flagged", customerId: 7, propertyId: 8 }),
    ]);

    assert.deepStrictEqual(result.skipped, [
        { rowNumber: 2, reason: "blocked" },
        { rowNumber: 3, reason: "flagged" },
    ]);
    assert.strictEqual(result.summary.rowsSkipped, 2);
    assert.deepStrictEqual([result.customers, result.properties, result.jobs], [[], [], []]);
});

test("a row with no city anywhere is imported, its property has a null city, and it is counted", () => {
    const result = plan([
        row(2, { city: null }),
        row(3, { name: "Bob New", phone: "801-555-0111", street: "2 Test St", city: null }, { kind: "new_property", customerId: 7, propertyId: null }),
        row(4, { name: "Cy Sheet", phone: "801-555-0122", street: "3 Test St", city: "Sheetville" }),
    ]);

    assert.deepStrictEqual(result.skipped, []);
    assert.deepStrictEqual(result.properties.map((property) => {
        return property.city;
    }), [null, null, "Sheetville"]);
    assert.strictEqual(result.summary.propertiesWithoutCity, 2);
    assert.strictEqual(result.jobs.length, 3);
});

test("a later row for the same property supplies the city an earlier row lacked", () => {
    const result = plan([row(2, { city: null }), row(3, { city: "Sheetville", date: "2025-10-21" })]);

    assert.strictEqual(result.properties.length, 1);
    assert.strictEqual(result.properties[0].city, "Sheetville");
    assert.strictEqual(result.summary.propertiesWithoutCity, 0);
});

test("the plan hash changes when a property gains or loses its city", () => {
    const without = plan([row(2, { city: null })]);
    const withCity = plan([row(2, { city: null })], { ...OPTIONS, defaultCity: "Defaultville" });

    assert.notStrictEqual(without.hash, withCity.hash);
});

test("a row on a property already on file needs no city and creates nothing but the job", () => {
    const result = plan([row(2, { city: null }, { kind: "existing", customerId: 7, propertyId: 8 })]);

    assert.deepStrictEqual(result.customers, []);
    assert.deepStrictEqual(result.properties, []);
    assert.deepStrictEqual(result.jobs, [{
        property: { id: 8 }, customer: { id: 7 }, date: "2025-10-14", amountCents: 4500, notes: null, rowNumber: 2,
    }]);
});

test("the default city fills a missing city, and a city in the sheet wins over it", () => {
    const result = plan([
        row(2, { city: null }),
        row(3, { name: "Bob New", phone: "801-555-0111", street: "2 Test St", city: "Sheetville" }),
    ], { ...OPTIONS, defaultCity: "Defaultville" });

    assert.deepStrictEqual(result.properties.map((property) => {
        return property.city;
    }), ["Defaultville", "Sheetville"]);
    assert.deepStrictEqual(result.skipped, []);
});

test("one person on several dated rows is one customer and one property with several jobs", () => {
    const result = plan([
        row(2, { date: "2025-10-14" }),
        row(3, { street: "1 test st", date: "2025-10-21", name: "ADA EXAMPLE" }),
        row(4, { street: "1 Test St.", date: "2025-10-28" }),
    ]);

    assert.strictEqual(result.customers.length, 1);
    assert.strictEqual(result.properties.length, 1);
    assert.deepStrictEqual(result.jobs.map((job) => {
        return job.date;
    }), ["2025-10-14", "2025-10-21", "2025-10-28"]);
    assert.deepStrictEqual(result.jobs[0].property, result.jobs[2].property);
});

test("a row with no phone joins the same name on the same street", () => {
    const result = plan([
        row(2, { phone: null }),
        row(3, { phone: "(801) 555-0100", date: "2025-10-21" }),
    ]);

    assert.strictEqual(result.customers.length, 1);
    assert.strictEqual(result.customers[0].phone, "(801) 555-0100");
    assert.strictEqual(result.jobs.length, 2);
});

test("the same name with different phones, or different names on one street, stay separate", () => {
    const result = plan([
        row(2),
        row(3, { phone: "801-555-0199", street: "9 Other Rd" }),
        row(4, { name: "Cy Other", phone: "801-555-0188" }),
    ]);

    assert.strictEqual(result.customers.length, 3);
    assert.strictEqual(result.properties.length, 3);
});

test("a known customer at a new street gets a new property under their id", () => {
    const result = plan([row(2, {}, { kind: "new_property", customerId: 7, propertyId: null })]);

    assert.deepStrictEqual(result.customers, []);
    assert.strictEqual(result.properties.length, 1);
    assert.deepStrictEqual(result.properties[0].customer, { id: 7 });
    assert.deepStrictEqual(result.jobs[0].customer, { id: 7 });
});

test("a row with no date still creates its customer and property, but no job", () => {
    const result = plan([row(2, { date: null })]);

    assert.strictEqual(result.customers.length, 1);
    assert.strictEqual(result.properties.length, 1);
    assert.deepStrictEqual(result.jobs, []);
    assert.strictEqual(result.summary.rowsWithoutDate, 1);
});

test("two rows for the same property, service, and date make one job", () => {
    const result = plan([row(2), row(3, { amountCents: 9900 })]);

    assert.strictEqual(result.jobs.length, 1);
    assert.strictEqual(result.jobs[0].amountCents, 4500, "the first row wins");
    assert.strictEqual(result.summary.duplicateJobsInSheet, 1);
});

test("an area sets a new property's area, or an existing property's once, first row first", () => {
    const result = plan([
        row(2, { area: "Oak Hills" }),
        row(3, { name: "Bob", phone: "801-555-0111", street: "5 Test St", area: null }, {
            kind: "existing", customerId: 7, propertyId: 8,
        }),
        row(4, { street: "5 Test St", area: "Elm Park", date: "2025-10-15" }, { kind: "existing", customerId: 7, propertyId: 8 }),
        row(5, { street: "5 Test St", area: "Pine Ridge", date: "2025-10-16" }, { kind: "existing", customerId: 7, propertyId: 8 }),
    ]);

    assert.strictEqual(result.properties[0].area, "Oak Hills");
    assert.deepStrictEqual(result.areaUpdates, [{ propertyId: 8, area: "Elm Park" }]);
});

test("an area over 100 characters is ignored rather than stored", () => {
    const result = plan([row(2, { area: "x".repeat(101) })]);
    assert.strictEqual(result.properties[0].area, null);
});

test("the hash is stable, ignores key order, and changes with anything the write would do differently", () => {
    const rows = [row(2), row(3, { date: "2025-10-21" })];
    const first = plan(rows).hash;

    assert.match(first, /^[0-9a-f]{64}$/);
    assert.strictEqual(plan(rows.map((entry) => {
        return Object.fromEntries(Object.entries(entry).reverse());
    })).hash, first);

    const changed = [
        plan([rows[0], { ...rows[1], date: "2025-10-22" }]).hash,
        plan([rows[0], { ...rows[1], amountCents: 1 }]).hash,
        plan([rows[0], { ...rows[1], rowNumber: 4 }]).hash,
        plan(rows, { ...OPTIONS, statusName: "Scheduled" }).hash,
        plan(rows, { ...OPTIONS, serviceTypeId: 2 }).hash,
        plan(rows, { ...OPTIONS, defaultCity: "Elsewhere" }).hash,
        buildPlan(rows, OPTIONS, { ...CONTEXT, sheetId: "sheet-2" }).hash,
        buildPlan(rows, OPTIONS, { ...CONTEXT, seasonYear: 2024 }).hash,
        plan([rows[0], { ...rows[1], match: { kind: "existing", customerId: 7, propertyId: 8 } }]).hash,
    ];

    assert.strictEqual(new Set([first, ...changed]).size, changed.length + 1);
});

test("planning does not change the rows it was given", () => {
    const rows = [row(2, { phone: null }), row(3)];
    const before = JSON.stringify(rows);
    plan(rows);
    assert.strictEqual(JSON.stringify(rows), before);
});

test("options accept an active service type, a known status, and a short default city", () => {
    const types = [{ id: 1 }, { id: 2 }];

    assert.deepStrictEqual(parseOptions({ serviceTypeId: "2" }, types), {
        errors: [], value: { serviceTypeId: 2, statusName: "Completed", defaultCity: "" },
    });
    assert.deepStrictEqual(parseOptions({ serviceTypeId: "1", statusName: "Scheduled", defaultCity: "  Provo " }, types).value, {
        serviceTypeId: 1, statusName: "Scheduled", defaultCity: "Provo",
    });
});

test("options refuse an unknown type, an unknown or unusable status, and a long city, without repeating them", () => {
    const types = [{ id: 1 }];

    for (const body of [{}, { serviceTypeId: "3" }, { serviceTypeId: "1.5" }, { serviceTypeId: "<b>" }]) {
        assert.deepStrictEqual(parseOptions(body, types).errors, ["Choose a service type from the list."]);
    }

    for (const statusName of ["Needs Review", "Done", "<b>"]) {
        assert.deepStrictEqual(parseOptions({ serviceTypeId: "1", statusName }, types).errors, ["Choose a status from the list."]);
    }

    const longCity = parseOptions({ serviceTypeId: "1", defaultCity: "x".repeat(101) }, types);
    assert.deepStrictEqual(longCity.errors, ["Default city must be at most 100 characters."]);
});
