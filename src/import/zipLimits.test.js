import { test } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertZipWithinLimits } from "./zipLimits.js";
import { readXlsxRows } from "./xlsxRows.js";
import { SpreadsheetImportError } from "./errors.js";

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "tiny.xlsx");

// A zip with no file data: just central-directory entries and the end record.
// Only the fields the checker reads are filled in, and the sizes are whatever the test declares.
function craftedZip(declaredSizes, { endFields = {} } = {}) {
    const entries = declaredSizes.map((size, index) => {
        const name = Buffer.from(`part${index}.xml`);
        const header = Buffer.alloc(46);
        header.writeUInt32LE(0x02014b50, 0);
        header.writeUInt32LE(size, 24);
        header.writeUInt16LE(name.length, 28);
        return Buffer.concat([header, name]);
    });
    const directory = Buffer.concat(entries);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(endFields.count ?? declaredSizes.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(endFields.offset ?? 0, 16);
    return Buffer.concat([directory, end]);
}

function refusal(code) {
    return (error) => {return error instanceof SpreadsheetImportError && error.code === code;};
}

test("a real workbook is within the limits", async () => {
    assertZipWithinLimits(await readFile(fixturePath));
});

test("declared sizes that add up past the cap are refused", () => {
    const half = 30 * 1024 * 1024;
    assert.throws(() => {return assertZipWithinLimits(craftedZip([half, half]));}, refusal("too_large"));
    assertZipWithinLimits(craftedZip([half]));
});

test("a single entry with the zip64 size marker is refused", () => {
    assert.throws(() => {return assertZipWithinLimits(craftedZip([0xffffffff]));}, refusal("too_large"));
});

test("too many entries are refused before the directory is walked", () => {
    const many = craftedZip(Array.from({ length: 201 }, () => {return 1;}));
    assert.throws(() => {return assertZipWithinLimits(many);}, refusal("too_large"));
    assertZipWithinLimits(craftedZip(Array.from({ length: 200 }, () => {return 1;})));
});

test("the zip64 end-record markers are refused", () => {
    assert.throws(() => {return assertZipWithinLimits(craftedZip([1], { endFields: { count: 0xffff } }));}, refusal("too_large"));
    assert.throws(() => {return assertZipWithinLimits(craftedZip([1], { endFields: { offset: 0xffffffff } }));}, refusal("too_large"));
});

test("a missing end record, a short file, and a directory that points off the end are invalid", () => {
    assert.throws(() => {return assertZipWithinLimits(Buffer.from("PK\x03\x04 and nothing else, long enough to scan"));}, refusal("invalid_workbook"));
    assert.throws(() => {return assertZipWithinLimits(Buffer.from("PK"));}, refusal("invalid_workbook"));
    assert.throws(() => {return assertZipWithinLimits(craftedZip([1], { endFields: { offset: 5000 } }));}, refusal("invalid_workbook"));
});

test("a trailing comment after the end record is still found", () => {
    const zip = Buffer.concat([craftedZip([1]), Buffer.from("a trailing comment")]);
    assertZipWithinLimits(zip);
});

test("readXlsxRows refuses a huge declared archive before it loads anything", async () => {
    const bomb = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        craftedZip([40 * 1024 * 1024, 40 * 1024 * 1024], { endFields: { offset: 4 } }),
    ]);
    await assert.rejects(() => {
        return readXlsxRows(bomb);
    }, refusal("too_large"));
});
