import { test } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { readXlsxRows } from "./xlsxRows.js";
import { SpreadsheetImportError } from "./errors.js";

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "tiny.xlsx");

async function workbookBytes(fill) {
    const workbook = new ExcelJS.Workbook();
    fill(workbook);
    const written = await workbook.xlsx.writeBuffer();
    return Buffer.from(written);
}

test("the fake fixture parses into rows", async () => {
    const bytes = await readFile(fixturePath);
    const sheets = await readXlsxRows(bytes);

    assert.deepStrictEqual(sheets, [
        {
            name: "Jobs",
            rows: [
                { rowNumber: 1, values: ["Name", "Phone", "Address"] },
                { rowNumber: 2, values: ["Ada Example", "555-0100", "1 Test Street"] },
            ],
        },
        {
            name: "Notes",
            rows: [
                { rowNumber: 1, values: ["Note"] },
                { rowNumber: 2, values: ["Fake note for the parser spike"] },
            ],
        },
    ]);
});

test("dates, formulas, and rich text become plain values", async () => {
    const bytes = await workbookBytes((workbook) => {
        const sheet = workbook.addWorksheet("Mixed");
        sheet.getCell("A1").value = new Date(Date.UTC(2026, 0, 2, 0, 0, 0));
        sheet.getCell("B1").value = { formula: "1+1", result: 2 };
        sheet.getCell("C1").value = {
            richText: [
                { text: "Ada " },
                { text: "Example" },
            ],
        };
        sheet.getCell("D1").value = {
            text: "Example link",
            hyperlink: "https://example.com",
        };
        sheet.getCell("E1").value = true;
    });

    const sheets = await readXlsxRows(bytes);
    assert.strictEqual(sheets.length, 1);
    assert.deepStrictEqual(sheets[0].rows, [
        {
            rowNumber: 1,
            values: [
                "2026-01-02T00:00:00.000Z",
                2,
                "Ada Example",
                "Example link",
                true,
            ],
        },
    ]);

    const serialized = JSON.stringify(sheets);
    assert.strictEqual(serialized.includes("formula"), false);
    assert.strictEqual(serialized.includes("hyperlink"), false);
    assert.strictEqual(serialized.includes("richText"), false);
});

test("size, sheet, row, and column limits are enforced", async () => {
    const tiny = await readFile(fixturePath);
    await assert.rejects(() => {
        return readXlsxRows(tiny, { maxBytes: 32 });
    }, (error) => {
        assert.ok(error instanceof SpreadsheetImportError);
        assert.strictEqual(error.code, "too_large");
        return true;
    });

    const wide = await workbookBytes((workbook) => {
        const sheet = workbook.addWorksheet("Wide");
        sheet.addRow(["a", "b", "c", "d"]);
    });
    await assert.rejects(() => {
        return readXlsxRows(wide, { maxColumns: 3 });
    }, (error) => {
        assert.strictEqual(error.code, "too_many_columns");
        return true;
    });

    const tall = await workbookBytes((workbook) => {
        const sheet = workbook.addWorksheet("Tall");
        sheet.addRow(["one"]);
        sheet.addRow(["two"]);
        sheet.addRow(["three"]);
        sheet.addRow(["four"]);
    });
    await assert.rejects(() => {
        return readXlsxRows(tall, { maxRows: 3 });
    }, (error) => {
        assert.strictEqual(error.code, "too_many_rows");
        return true;
    });

    const many = await workbookBytes((workbook) => {
        workbook.addWorksheet("One");
        workbook.addWorksheet("Two");
        workbook.addWorksheet("Three");
    });
    await assert.rejects(() => {
        return readXlsxRows(many, { maxSheets: 2 });
    }, (error) => {
        assert.strictEqual(error.code, "too_many_sheets");
        return true;
    });
});

test("a file that is not an xlsx workbook is rejected", async () => {
    await assert.rejects(() => {
        return readXlsxRows(Buffer.from("not a workbook"));
    }, (error) => {
        assert.strictEqual(error.code, "invalid_workbook");
        assert.strictEqual(error.message.includes("exceljs"), false);
        return true;
    });

    const fakeZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    await assert.rejects(() => {
        return readXlsxRows(fakeZip);
    }, (error) => {
        assert.ok(error instanceof SpreadsheetImportError);
        assert.strictEqual(error.code, "invalid_workbook");
        assert.strictEqual(error.message.includes("End of data"), false);
        return true;
    });
});
