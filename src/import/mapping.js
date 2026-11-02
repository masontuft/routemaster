import { SPREADSHEET_LIMITS } from "./limits.js";
import { IMPORT_FIELDS } from "./fields.js";
import { columnCount } from "./columns.js";

const WHOLE_NUMBER = /^\d{1,5}$/;
const COLUMN_NUMBER = /^\d{1,2}$/;
const YEAR = /^\d{4}$/;
const FIRST_SEASON_YEAR = 2000;

// The form fields come back from the browser, so every value is checked again here.
// Errors are fixed sentences: they never repeat what was submitted.
export function parseSheetChoice(body, sheets) {
    const name = String(body.sheet ?? "");
    const sheet = sheets.find((candidate) => {
        return candidate.name === name;
    });

    if (sheet === undefined) {
        return { errors: ["Choose a sheet from the list."] };
    }

    if (sheet.rows.length === 0) {
        return { errors: ["That sheet has no rows."] };
    }

    const lastRow = sheet.rows[sheet.rows.length - 1].rowNumber;
    const raw = String(body.headerRow ?? "").trim();
    const headerRow = raw === "" ? sheet.rows[0].rowNumber : Number(raw);

    if (raw !== "" && WHOLE_NUMBER.test(raw) === false) {
        return { errors: ["Enter the header row as a whole number."] };
    }

    if (headerRow < 1 || headerRow > lastRow) {
        return { errors: ["The header row must be a row that exists in the sheet."] };
    }

    return { errors: [], sheet, headerRow };
}

export function parseMapping(body, sheets, now = new Date()) {
    const choice = parseSheetChoice(body, sheets);
    if (choice.errors.length > 0) {
        return choice;
    }

    const errors = [];
    const seasonYear = String(body.seasonYear ?? "").trim();
    if (YEAR.test(seasonYear) === false
        || Number(seasonYear) < FIRST_SEASON_YEAR
        || Number(seasonYear) > now.getUTCFullYear() + 1) {
        errors.push("Enter a four-digit season year.");
    }

    const available = Math.min(columnCount(choice.sheet), SPREADSHEET_LIMITS.maxColumns);
    const columns = {};
    const used = new Set();

    for (const field of IMPORT_FIELDS) {
        const raw = String(body[`col_${field.key}`] ?? "").trim();

        if (raw === "") {
            if (field.required) {
                errors.push(`Choose a column for ${field.label}.`);
            }
            continue;
        }

        if (COLUMN_NUMBER.test(raw) === false || Number(raw) >= available) {
            errors.push(`Choose a column from the list for ${field.label}.`);
            continue;
        }

        if (used.has(Number(raw))) {
            errors.push("Each column can be used for only one field.");
            continue;
        }

        used.add(Number(raw));
        columns[field.key] = Number(raw);
    }

    if (errors.length > 0) {
        return { errors, sheet: choice.sheet, headerRow: choice.headerRow };
    }

    return {
        errors,
        sheet: choice.sheet,
        headerRow: choice.headerRow,
        seasonYear: Number(seasonYear),
        columns,
    };
}
