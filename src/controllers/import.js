import { SpreadsheetImportError } from "../import/errors.js";
import { extractGoogleSheetId } from "../import/googleSheet.js";
import { readXlsxRows } from "../import/xlsxRows.js";
import { describeColumns, columnCount } from "../import/columns.js";
import { IMPORT_FIELDS } from "../import/fields.js";
import { parseMapping, parseSheetChoice } from "../import/mapping.js";
import { buildCandidates } from "../import/candidates.js";
import { classifyCandidates, MATCH_KINDS } from "../import/matching.js";
import { parseOptions, IMPORT_STATUSES, DEFAULT_STATUS, MAX_CITY_LENGTH } from "../import/options.js";
import { buildPlan } from "../import/plan.js";
import { applyImport } from "../import/apply.js";
import * as ServiceType from "../models/serviceType.js";
import * as ImportBatch from "../models/importBatch.js";
import { notFound } from "../utils/errors.js";
import { parseId } from "../utils/validation.js";

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

// Only values the form could have produced are echoed back.
function pickedOptions(body) {
    const type = String(body.serviceTypeId ?? "");
    const status = String(body.statusName ?? "");
    return {
        serviceTypeId: /^\d{1,9}$/.test(type) ? type : "",
        statusName: IMPORT_STATUSES.includes(status) ? status : DEFAULT_STATUS,
        defaultCity: String(body.defaultCity ?? "").slice(0, MAX_CITY_LENGTH),
    };
}

async function mappingPage(req, res, { sheetId, sheet, headerRow, body, errors = [], status = 200 }) {
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
        optionValues: pickedOptions(body),
        serviceTypes: await ServiceType.listActive(req.app.locals.db),
        statuses: IMPORT_STATUSES,
        errors,
    }, status);
}

// Coming from the tab list, with nothing chosen yet, the form starts from what was saved for this tab.
function withSavedMapping(body, saved) {
    const fromSaved = {};
    for (const field of IMPORT_FIELDS) {
        if (Number.isInteger(saved.columns?.[field.key])) {
            fromSaved[`col_${field.key}`] = String(saved.columns[field.key]);
        }
    }

    return {
        ...body,
        headerRow: body.headerRow ?? String(saved.header_row),
        serviceTypeId: String(saved.options?.serviceTypeId ?? ""),
        statusName: saved.options?.statusName,
        defaultCity: saved.options?.defaultCity,
        ...fromSaved,
    };
}

function hasChoices(body) {
    return "seasonYear" in body || Object.keys(body).some((key) => {
        return key.startsWith("col_");
    });
}

export async function showMapping(req, res) {
    try {
        const { sheetId, sheets } = await loadSheets(req, canonicalLink(String(req.body.sheetId ?? "")));
        let body = req.body;
        let choice = parseSheetChoice(body, sheets);

        if (choice.errors.length === 0 && hasChoices(body) === false) {
            const saved = await ImportBatch.findMapping(req.app.locals.db, sheetId, choice.sheet.name);
            const merged = saved ? withSavedMapping(body, saved) : null;
            const savedChoice = merged ? parseSheetChoice(merged, sheets) : null;
            if (savedChoice?.errors.length === 0) {
                body = merged;
                choice = savedChoice;
            }
        }

        if (choice.errors.length > 0) {
            return pageFor(res, "import", { sheets: tabSummary(sheets), sheetId, errors: choice.errors }, 400);
        }

        await mappingPage(req, res, { sheetId, sheet: choice.sheet, headerRow: choice.headerRow, body });
    } catch (error) {
        failWith(res, error);
    }
}

// Everything the preview, and the confirm step, need from one download of the sheet.
async function readImport(req) {
    const { sheetId, sheets } = await loadSheets(req, canonicalLink(String(req.body.sheetId ?? "")));
    const mapping = parseMapping(req.body, sheets);
    const serviceTypes = await ServiceType.listActive(req.app.locals.db);
    const options = parseOptions(req.body, serviceTypes);
    return { sheetId, sheets, mapping, options, errors: [...mapping.errors, ...options.errors] };
}

function contextOf(sheetId, mapping) {
    return { sheetId, sheetName: mapping.sheet.name, seasonYear: mapping.seasonYear };
}

function skippedBy(plan) {
    const counts = { blocked: 0, flagged: 0, missing_city: 0 };
    for (const entry of plan.skipped) {
        counts[entry.reason] += 1;
    }
    return counts;
}

async function previewPage(req, res, { sheetId, mapping, options, errors = [], status = 200 }) {
    const { candidates, skippedEmpty } = buildCandidates(mapping.sheet, mapping);
    const { rows, summary } = await classifyCandidates(req.app.locals.db, candidates);
    const plan = buildPlan(rows, options.value, contextOf(sheetId, mapping));
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
        optionValues: pickedOptions(req.body),
        fields: IMPORT_FIELDS,
        summary,
        skippedEmpty,
        groups,
        kinds: MATCH_KINDS,
        perKind: PREVIEW_ROWS_PER_KIND,
        plan: plan.summary,
        planHash: plan.hash,
        skipped: skippedBy(plan),
        canConfirm: plan.customers.length + plan.properties.length + plan.jobs.length + plan.areaUpdates.length > 0,
        errors,
    }, status);
}

// A bad choice goes back to the mapping form, or to the tab list if the sheet itself was not valid.
async function backToForm(req, res, { sheetId, sheets, mapping, errors }) {
    if (mapping.sheet === undefined) {
        return pageFor(res, "import", { sheets: tabSummary(sheets), sheetId, errors }, 400);
    }

    return mappingPage(req, res, {
        sheetId, sheet: mapping.sheet, headerRow: mapping.headerRow, body: req.body, errors, status: 400,
    });
}

export async function showPreview(req, res) {
    try {
        const read = await readImport(req);
        if (read.errors.length > 0) {
            return await backToForm(req, res, read);
        }

        await previewPage(req, res, read);
    } catch (error) {
        failWith(res, error);
    }
}

// Confirm downloads the sheet again, then recomputes the plan inside the import's transaction and compares
// it with the hash the owner saw. If anything differs the owner gets a fresh preview and nothing is written.
export async function confirmImport(req, res) {
    try {
        const read = await readImport(req);
        if (read.errors.length > 0) {
            return await backToForm(req, res, read);
        }

        const { sheetId, mapping, options } = read;
        const { candidates } = buildCandidates(mapping.sheet, mapping);
        const context = contextOf(sheetId, mapping);

        try {
            const { batchId } = await applyImport(req.app.locals.db, {
                postedHash: String(req.body.planHash ?? ""),
                computePlan: async (client) => {
                    const { rows } = await classifyCandidates(client, candidates);
                    return buildPlan(rows, options.value, context);
                },
                context,
                options: options.value,
                mapping: {
                    sheetId, sheetName: mapping.sheet.name, headerRow: mapping.headerRow, columns: mapping.columns,
                },
                userId: req.session.user.id,
            });
            return res.redirect(303, `/admin/import/batches/${batchId}`);
        } catch (error) {
            if (error instanceof SpreadsheetImportError && error.code === "stale_plan") {
                return await previewPage(req, res, { ...read, errors: [error.message], status: 409 });
            }
            throw error;
        }
    } catch (error) {
        failWith(res, error);
    }
}

export async function showBatch(req, res) {
    const id = parseId(req.params.id);
    const batch = id ? await ImportBatch.find(req.app.locals.db, id) : null;

    if (batch === null) {
        throw notFound();
    }

    pageFor(res, "import-batch", { title: "Import Complete", batch });
}
