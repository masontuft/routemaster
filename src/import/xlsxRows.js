// Reads an .xlsx buffer into plain rows. No route calls this yet.

import ExcelJS from "exceljs";
import { SpreadsheetImportError } from "./errors.js";
import { SPREADSHEET_LIMITS } from "./limits.js";

const XLSX_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const TOO_LARGE_MESSAGE = "That spreadsheet is larger than the size limit.";
const INVALID_WORKBOOK_MESSAGE = "That file is not a readable .xlsx workbook.";
const TOO_MANY_SHEETS_MESSAGE = "That spreadsheet has more sheets than the limit.";
const TOO_MANY_ROWS_MESSAGE = "That spreadsheet has more rows than the limit.";
const TOO_MANY_COLUMNS_MESSAGE = "That spreadsheet has more columns than the limit.";

function asBuffer(input) {
    if (Buffer.isBuffer(input)) {
        return input;
    }

    if (input instanceof Uint8Array) {
        return Buffer.from(input);
    }

    throw new SpreadsheetImportError("invalid_workbook", INVALID_WORKBOOK_MESSAGE);
}

function hasXlsxSignature(bytes) {
    if (bytes.length < XLSX_SIGNATURE.length) {
        return false;
    }

    return bytes.subarray(0, XLSX_SIGNATURE.length).equals(XLSX_SIGNATURE);
}

function plainCellValue(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === "string" || typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        if (Number.isFinite(value) === false) {
            return null;
        }
        return value;
    }

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return null;
        }
        return value.toISOString();
    }

    if (typeof value !== "object") {
        return null;
    }

    if (Object.prototype.hasOwnProperty.call(value, "richText") && Array.isArray(value.richText)) {
        let text = "";
        for (const part of value.richText) {
            if (part !== null && typeof part === "object" && typeof part.text === "string") {
                text += part.text;
            }
        }
        return text;
    }

    if (Object.prototype.hasOwnProperty.call(value, "formula") || Object.prototype.hasOwnProperty.call(value, "sharedFormula")) {
        if (Object.prototype.hasOwnProperty.call(value, "result")) {
            return plainCellValue(value.result);
        }
        return null;
    }

    if (typeof value.text === "string") {
        return value.text;
    }

    return null;
}

function cellValues(row, maxColumns) {
    const raw = row.values;
    if (Array.isArray(raw) === false) {
        return [];
    }

    const columnCount = raw.length - 1;
    if (columnCount > maxColumns) {
        throw new SpreadsheetImportError("too_many_columns", TOO_MANY_COLUMNS_MESSAGE);
    }

    const values = [];
    for (let index = 1; index < raw.length; index += 1) {
        values.push(plainCellValue(raw[index]));
    }

    while (values.length > 0 && values[values.length - 1] === null) {
        values.pop();
    }

    return values;
}

export async function readXlsxRows(input, options = {}) {
    const bytes = asBuffer(input);
    const maxBytes = options.maxBytes ?? SPREADSHEET_LIMITS.maxBytes;
    const maxSheets = options.maxSheets ?? SPREADSHEET_LIMITS.maxSheets;
    const maxRows = options.maxRows ?? SPREADSHEET_LIMITS.maxRows;
    const maxColumns = options.maxColumns ?? SPREADSHEET_LIMITS.maxColumns;

    if (bytes.length > maxBytes) {
        throw new SpreadsheetImportError("too_large", TOO_LARGE_MESSAGE);
    }

    if (hasXlsxSignature(bytes) === false) {
        throw new SpreadsheetImportError("invalid_workbook", INVALID_WORKBOOK_MESSAGE);
    }

    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(bytes);
    } catch (error) {
        if (error instanceof SpreadsheetImportError) {
            throw error;
        }
        throw new SpreadsheetImportError("invalid_workbook", INVALID_WORKBOOK_MESSAGE);
    }

    if (workbook.worksheets.length > maxSheets) {
        throw new SpreadsheetImportError("too_many_sheets", TOO_MANY_SHEETS_MESSAGE);
    }

    const sheets = [];
    let totalRows = 0;

    for (const worksheet of workbook.worksheets) {
        const rows = [];
        worksheet.eachRow({ includeEmpty: false }, (row) => {
            totalRows += 1;
            if (totalRows > maxRows) {
                throw new SpreadsheetImportError("too_many_rows", TOO_MANY_ROWS_MESSAGE);
            }

            rows.push({
                rowNumber: row.number,
                values: cellValues(row, maxColumns),
            });
        });

        sheets.push({
            name: worksheet.name,
            rows,
        });
    }

    return sheets;
}
