import { test } from "node:test";
import assert from "node:assert";
import { parseMapping, parseSheetChoice } from "./mapping.js";

const NOW = new Date("2026-11-02T12:00:00Z");
const sheets = [
    {
        name: "Fall",
        rows: [
            { rowNumber: 1, values: ["Name", "Phone", "Street", "Done"] },
            { rowNumber: 2, values: ["Ada", "801 555 0100", "1 Test St", "yes"] },
        ],
    },
    { name: "Blank", rows: [] },
];

function body(extra = {}) {
    return { sheet: "Fall", headerRow: "1", seasonYear: "2025", col_name: "0", col_street: "2", ...extra };
}

test("a sheet must exist, and an empty sheet is refused", () => {
    assert.deepStrictEqual(parseSheetChoice({ sheet: "Nope" }, sheets).errors, ["Choose a sheet from the list."]);
    assert.deepStrictEqual(parseSheetChoice({ sheet: "Blank" }, sheets).errors, ["That sheet has no rows."]);
    assert.deepStrictEqual(parseSheetChoice({}, sheets).errors, ["Choose a sheet from the list."]);
});

test("the header row defaults to the first row and must be a row inside the sheet", () => {
    assert.strictEqual(parseSheetChoice({ sheet: "Fall" }, sheets).headerRow, 1);
    assert.strictEqual(parseSheetChoice({ sheet: "Fall", headerRow: "2" }, sheets).headerRow, 2);

    for (const bad of ["0", "3", "-1", "1.5", "abc", "99999999"]) {
        assert.strictEqual(parseSheetChoice({ sheet: "Fall", headerRow: bad }, sheets).errors.length, 1, bad);
    }
});

test("a valid mapping returns numbers, not the submitted strings", () => {
    const result = parseMapping(body({ col_phone: "1" }), sheets, NOW);
    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.seasonYear, 2025);
    assert.deepStrictEqual(result.columns, { name: 0, phone: 1, street: 2 });
    assert.strictEqual(result.sheet, sheets[0]);
});

test("name and street columns are required", () => {
    const result = parseMapping(body({ col_name: "", col_street: "" }), sheets, NOW);
    assert.deepStrictEqual(result.errors, ["Choose a column for Customer Name.", "Choose a column for Street Address."]);
});

test("a column index outside the sheet, or not a number, is refused", () => {
    for (const bad of ["4", "99", "-1", "1.5", "abc", "0x1"]) {
        const result = parseMapping(body({ col_phone: bad }), sheets, NOW);
        assert.deepStrictEqual(result.errors, ["Choose a column from the list for Phone."], bad);
    }
});

test("one column cannot feed two fields", () => {
    const result = parseMapping(body({ col_phone: "0" }), sheets, NOW);
    assert.deepStrictEqual(result.errors, ["Each column can be used for only one field."]);
});

test("the season year must be four digits between 2000 and next year", () => {
    for (const bad of ["", "25", "1999", "2028", "20x5", "2025.5"]) {
        const result = parseMapping(body({ seasonYear: bad }), sheets, NOW);
        assert.deepStrictEqual(result.errors, ["Enter a four-digit season year."], bad);
    }

    assert.deepStrictEqual(parseMapping(body({ seasonYear: "2027" }), sheets, NOW).errors, []);
});

test("errors never repeat what was submitted", () => {
    const result = parseMapping(body({ col_phone: "<script>", seasonYear: "<b>" }), sheets, NOW);
    assert.ok(JSON.stringify(result.errors).includes("<") === false);
});
