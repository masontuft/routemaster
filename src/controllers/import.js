import { SpreadsheetImportError } from "../import/errors.js";
import { readXlsxRows } from "../import/xlsxRows.js";

// Upstream failures are the server's or Google's fault; everything else is the owner's input.
const UPSTREAM_CODES = ["network", "timeout", "download_failed", "aborted"];

export function showForm(req, res) {
    res.render("admin/import", { title: "Import Spreadsheet", errors: [], sheets: null });
}

// Counts only: the parsed rows stay on the server until the mapping step exists.
function summarize(sheets) {
    return sheets.map((sheet) => {return {
        name: sheet.name,
        rowCount: sheet.rows.length,
        columnCount: Math.max(0, ...sheet.rows.map((row) => {return row.values.length;})),
    };});
}

export async function submitLink(req, res) {
    const link = String(req.body.link ?? "").trim();

    try {
        const { bytes } = await req.app.locals.fetchSheet(link);
        const sheets = summarize(await readXlsxRows(bytes));
        res.render("admin/import", { title: "Import Spreadsheet", errors: [], sheets });
    } catch (error) {
        if (error instanceof SpreadsheetImportError === false) {
            throw error;
        }

        // The error messages never contain the pasted link, so they are safe to show.
        const status = UPSTREAM_CODES.includes(error.code) ? 502 : 400;
        res.status(status).render("admin/import", { title: "Import Spreadsheet", errors: [error.message], sheets: null });
    }
}
