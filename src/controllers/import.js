import { SpreadsheetImportError } from "../import/errors.js";
import { extractGoogleSheetId } from "../import/googleSheet.js";
import { readXlsxRows } from "../import/xlsxRows.js";
import { describeColumns, columnCount } from "../import/columns.js";
import { IMPORT_FIELDS } from "../import/fields.js";
import { parseMapping, parseSheetChoice } from "../import/mapping.js";
import { buildCandidates } from "../import/candidates.js";
import { classifyCandidates, MATCH_KINDS } from "../import/matching.js";

// Upstream failures are the server's or Google's fault; everything else is the owner's input.
const UPSTREAM_CODES = ["network", "timeout", "download_failed", "aborted"];
const PREVIEW_ROWS_PER_KIND = 100;
// What needs the owner's attention comes first.
const PREVIEW_ORDER = ["blocked", "flagged", "new_property", "new", "existing"];

function pageFor(res, view, data, status = 200) {
    res.status(status).render(`admin/${view}`, { title: "Import Spreadsheet", errors: [], ...data });
}

// Only the sheet id travels between steps. The link is rebuilt from it, so a tampered hidden field
// cannot carry a host, a query, or anything else: it either parses as an id or the step is refused.
function canonicalLink(sheetId) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
}

async function loadSheets(req, link) {
    const sheetId = extractGoogleSheetId(link);
    const { bytes } = await req.app.locals.fetchSheet(canonicalLink(sheetId));
    return { sheetId, sheets: await readXlsxRows(bytes) };
}

// The error messages never contain the pasted link or any cell value, so they are safe to show.
function failWith(res, error) {
    if (error instanceof SpreadsheetImportError === false) {
        throw error;
    }

    const status = UPSTREAM_CODES.includes(error.code) ? 502 : 400;
    pageFor(res, "import", { errors: [error.message], sheets: null, sheetId: null }, status);
}

function tabSummary(sheets) {
    return sheets.map((sheet) => {
        return { name: sheet.name, rowCount: sheet.rows.length, columnCount: columnCount(sheet) };
    });
}

export function showForm(req, res) {
    pageFor(res, "import", { sheets: null, sheetId: null });
}

export async function submitLink(req, res) {
    try {
        const { sheetId, sheets } = await loadSheets(req, String(req.body.link ?? "").trim());
        pageFor(res, "import", { sheets: tabSummary(sheets), sheetId });
    } catch (error) {
        failWith(res, error);
    }
}

// Only digits are echoed back into the form, so a stray value cannot ride along.
function pickedColumns(body) {
    const picked = {};
    for (const field of IMPORT_FIELDS) {
        const raw = String(body[`col_${field.key}`] ?? "");
        picked[field.key] = /^\d{1,2}$/.test(raw) ? raw : "";
    }
    return picked;
}

function mappingPage(res, { sheetId, sheet, headerRow, body, errors = [], status = 200 }) {
    const seasonYear = /^\d{0,4}$/.test(String(body.seasonYear ?? ""))
        ? String(body.seasonYear ?? "")
        : "";

    pageFor(res, "import-mapping", {
        sheetId,
        sheetName: sheet.name,
        headerRow,
        seasonYear: seasonYear === "" ? String(new Date().getUTCFullYear()) : seasonYear,
        columns: describeColumns(sheet, headerRow),
        fields: IMPORT_FIELDS,
        picked: pickedColumns(body),
        errors,
    }, status);
}

export async function showMapping(req, res) {
    try {
        const { sheetId, sheets } = await loadSheets(req, canonicalLink(String(req.body.sheetId ?? "")));
        const choice = parseSheetChoice(req.body, sheets);

        if (choice.errors.length > 0) {
            return pageFor(res, "import", { sheets: tabSummary(sheets), sheetId, errors: choice.errors }, 400);
        }

        mappingPage(res, { sheetId, sheet: choice.sheet, headerRow: choice.headerRow, body: req.body });
    } catch (error) {
        failWith(res, error);
    }
}

export async function showPreview(req, res) {
    try {
        const { sheetId, sheets } = await loadSheets(req, canonicalLink(String(req.body.sheetId ?? "")));
        const mapping = parseMapping(req.body, sheets);

        if (mapping.errors.length > 0) {
            if (mapping.sheet === undefined) {
                return pageFor(res, "import", { sheets: tabSummary(sheets), sheetId, errors: mapping.errors }, 400);
            }

            return mappingPage(res, {
                sheetId, sheet: mapping.sheet, headerRow: mapping.headerRow, body: req.body,
                errors: mapping.errors, status: 400,
            });
        }

        const { candidates, skippedEmpty } = buildCandidates(mapping.sheet, mapping);
        const { rows, summary } = await classifyCandidates(req.app.locals.db, candidates);
        const groups = PREVIEW_ORDER.map((kind) => {
            const ofKind = rows.filter((row) => {
                return row.match.kind === kind;
            });
            return { kind, total: ofKind.length, shown: ofKind.slice(0, PREVIEW_ROWS_PER_KIND) };
        });

        pageFor(res, "import-preview", {
            sheetId,
            sheetName: mapping.sheet.name,
            headerRow: mapping.headerRow,
            seasonYear: mapping.seasonYear,
            picked: pickedColumns(req.body),
            fields: IMPORT_FIELDS,
            summary,
            skippedEmpty,
            groups,
            kinds: MATCH_KINDS,
            perKind: PREVIEW_ROWS_PER_KIND,
        });
    } catch (error) {
        failWith(res, error);
    }
}
