import { test } from "node:test";
import assert from "node:assert";
import { columnLabel, describeColumns } from "./columns.js";

test("columns are labeled the way a spreadsheet labels them", () => {
    assert.strictEqual(columnLabel(0), "A");
    assert.strictEqual(columnLabel(25), "Z");
    assert.strictEqual(columnLabel(26), "AA");
    assert.strictEqual(columnLabel(27), "AB");
    assert.strictEqual(columnLabel(51), "AZ");
    assert.strictEqual(columnLabel(52), "BA");
    assert.strictEqual(columnLabel(63), "BL");
});

test("describeColumns names a column by its header, or by its letter when the header is blank", () => {
    const sheet = {
        name: "Jobs",
        rows: [
            { rowNumber: 2, values: ["Name", null, "Street"] },
            { rowNumber: 3, values: ["Ada", "done", "1 Test St"] },
            { rowNumber: 5, values: ["Bob", "paid", null] },
            { rowNumber: 6, values: ["Cy", null, "3 Test St"] },
            { rowNumber: 7, values: ["Di", "done", "4 Test St"] },
            { rowNumber: 8, values: ["Ed", "done", "5 Test St"] },
        ],
    };

    const columns = describeColumns(sheet, 2);

    assert.deepStrictEqual(columns.map((column) => {
        return column.name;
    }), ["Name", "Column B", "Street"]);
    assert.deepStrictEqual(columns[0].samples, ["Ada", "Bob", "Cy"]);
    assert.deepStrictEqual(columns[1].samples, ["done", "paid", "done"]);
    assert.deepStrictEqual(columns[2].samples, ["1 Test St", "3 Test St", "4 Test St"]);
});

test("a header row number with no row behind it still splits header from data", () => {
    const sheet = { name: "Jobs", rows: [{ rowNumber: 4, values: ["Ada"] }] };
    const columns = describeColumns(sheet, 2);
    assert.strictEqual(columns[0].name, "Column A");
    assert.deepStrictEqual(columns[0].samples, ["Ada"]);
});

test("an empty sheet has no columns", () => {
    assert.deepStrictEqual(describeColumns({ name: "Empty", rows: [] }, 1), []);
});
