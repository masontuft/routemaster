import { test } from "node:test";
import assert from "node:assert";
import { buildCandidates, parseAmountCents, parseSeasonDate } from "./candidates.js";

test("dates keep the month and day and take the year from the season", () => {
    const cases = [
        ["10/14", "2025-10-14"],
        ["10/14/24", "2025-10-14"],
        ["1-5", "2025-01-05"],
        ["2019-10-14", "2025-10-14"],
        ["2019-10-14T00:00:00.000Z", "2025-10-14"],
        ["Oct 14", "2025-10-14"],
        ["October 14th", "2025-10-14"],
        ["oct. 4, 2023", "2025-10-04"],
    ];

    for (const [text, expected] of cases) {
        assert.strictEqual(parseSeasonDate(text, 2025), expected, text);
    }
});

test("dates that do not exist in the season year are not dates", () => {
    for (const text of ["2/30", "13/1", "0/5", "4/31", "soon", "10/", "Octember 3", "2/29"]) {
        assert.strictEqual(parseSeasonDate(text, 2025), null, text);
    }

    assert.strictEqual(parseSeasonDate("2/29", 2024), "2024-02-29");
});

test("amounts are read only when plainly dollars", () => {
    assert.strictEqual(parseAmountCents("45"), 4500);
    assert.strictEqual(parseAmountCents("$45"), 4500);
    assert.strictEqual(parseAmountCents("$45.5"), 4550);
    assert.strictEqual(parseAmountCents("1,200.00"), 120000);

    for (const text of ["45 cash", "venmo", "$", "4.555", "-5", "$45/yr"]) {
        assert.strictEqual(parseAmountCents(text), null, text);
    }
});

const mapping = {
    headerRow: 1,
    seasonYear: 2025,
    columns: { name: 0, phone: 1, street: 2, date: 3, amount: 4 },
};

function sheetOf(...rows) {
    return {
        name: "Fall",
        rows: [{ rowNumber: 1, values: ["Name", "Phone", "Street", "Date", "Amount"] }, ...rows],
    };
}

test("a good row becomes a candidate with no issues", () => {
    const { candidates, skippedEmpty } = buildCandidates(
        sheetOf({ rowNumber: 2, values: [" Ada Example ", "(801) 555-0100", "1 Test Street", "10/14", "$45"] }),
        mapping,
    );

    assert.strictEqual(skippedEmpty, 0);
    assert.deepStrictEqual(candidates, [{
        rowNumber: 2,
        name: "Ada Example",
        phone: "(801) 555-0100",
        street: "1 Test Street",
        city: null,
        zip: null,
        date: "2025-10-14",
        amountCents: 4500,
        area: null,
        notes: null,
        issues: [],
        blocked: false,
    }]);
});

test("a missing name or street blocks the row; a bad phone, date, or amount only warns", () => {
    const { candidates } = buildCandidates(sheetOf(
        { rowNumber: 2, values: [null, "801 555 0100", "1 Test St", null, null] },
        { rowNumber: 3, values: ["Bob", null, null, null, null] },
        { rowNumber: 4, values: ["Cy", "555", "3 Test St", "someday", "lots"] },
    ), mapping);

    assert.deepStrictEqual(candidates.map((candidate) => {
        return candidate.blocked;
    }), [true, true, false]);
    assert.deepStrictEqual(candidates[0].issues, ["Missing customer name."]);
    assert.deepStrictEqual(candidates[1].issues, ["Missing street address."]);
    assert.deepStrictEqual(candidates[2].issues, [
        "Phone number is not 10 digits.",
        "Date not recognized.",
        "Amount not recognized.",
    ]);
    assert.strictEqual(candidates[2].date, null);
    assert.strictEqual(candidates[2].amountCents, null);
});

test("rows above and at the header are ignored, and blank spacer rows are counted", () => {
    const sheet = {
        name: "Fall",
        rows: [
            { rowNumber: 1, values: ["Title row", null, null, null, null] },
            { rowNumber: 2, values: ["Name", "Phone", "Street", "Date", "Amount"] },
            { rowNumber: 3, values: ["Ada", null, "1 Test St", null, null] },
            { rowNumber: 4, values: [null, null, null, "x", "y"] },
            { rowNumber: 5, values: ["", " ", null] },
        ],
    };

    const { candidates, skippedEmpty } = buildCandidates(sheet, { ...mapping, headerRow: 2 });

    assert.deepStrictEqual(candidates.map((candidate) => {
        return candidate.rowNumber;
    }), [3, 4]);
    assert.strictEqual(candidates[1].blocked, true);
    assert.strictEqual(skippedEmpty, 1);
});

test("numbers and booleans from the parser are read as text", () => {
    const { candidates } = buildCandidates(sheetOf(
        { rowNumber: 2, values: ["Ada", 8015550100, "1 Test St", null, 45] },
    ), mapping);

    assert.strictEqual(candidates[0].phone, "8015550100");
    assert.strictEqual(candidates[0].amountCents, 4500);
    assert.deepStrictEqual(candidates[0].issues, []);
});
