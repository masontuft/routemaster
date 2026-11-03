import * as Area from "../models/area.js";
import * as LinkBatch from "../models/linkBatch.js";
import { notFound } from "../utils/errors.js";
import { normalizePhone } from "../utils/normalize.js";
import { toCsv } from "../utils/csv.js";
import { parseId, todayString, validateLinkBatch, DEFAULT_LINK_MESSAGE } from "../utils/validation.js";

// Every page here carries names, phones or live links, so none may be cached or replayed.
async function formPage(req, res, { values, errors = [], status = 200 }) {
    const db = req.app.locals.db;
    const areas = await Area.list(db, todayString());
    const preview = values.areaId ? await LinkBatch.preview(db, values.areaId, values) : null;
    res.set("Cache-Control", "no-store");
    res.status(status).render("staff/link-batch-new", {
        title: "Send Scheduling Links", areas, values, errors, preview, max: LinkBatch.MAX_BATCH,
    });
}

export async function showNew(req, res) {
    const values = {
        areaId: parseId(req.query.areaId), days: 30, includeActive: req.query.includeActive === "1",
        template: DEFAULT_LINK_MESSAGE,
    };
    await formPage(req, res, { values });
}

// One pass with a function, so a name that contains "{link}" or "$&" is inserted as plain text and never expanded.
function messageFor(template, name, link) {
    return template.replace(/\{(name|link)\}/g, (match, key) => {
        return key === "name" ? name : link;
    });
}

export async function create(req, res) {
    const { values, errors } = validateLinkBatch(req.body);

    if (errors.length > 0) {
        return formPage(req, res, { values: { ...values, days: req.body.days }, errors, status: 400 });
    }

    const result = await LinkBatch.create(req.app.locals.db, {
        areaId: values.areaId, createdBy: req.session.user.id, days: values.days, includeActive: values.includeActive,
    });

    if (result.error === "not_found") {
        throw notFound();
    }

    if (result.error === "too_many") {
        return formPage(req, res, {
            values, status: 400,
            errors: [`That would make ${result.count} links. A batch holds at most ${LinkBatch.MAX_BATCH}.`],
        });
    }

    await renderResult(req, res, { areaId: values.areaId, template: values.template, days: values.days, result });
}

// The page that shows a made batch once. Shared with the rebooking page, which makes batches for ticked customers.
export async function renderResult(req, res, { areaId, template, days, result }) {
    const origin = `${req.protocol}://${req.get("host")}`;
    const rows = result.rows.map((row) => {
        const link = `${origin}/l/${row.token}`;
        const message = messageFor(template, row.name, link);
        return { name: row.name, phone: normalizePhone(row.phone), message };
    });
    const csv = toCsv([["name", "phone", "message"], ...rows.map((row) => {
        return [row.name, row.phone, row.message];
    })]);
    const area = await Area.find(req.app.locals.db, areaId);

    // The links exist only in this response. Refreshing it would run the batch again.
    res.set("Cache-Control", "no-store");
    res.render("staff/link-batch-result", {
        title: "Scheduling Links", area, rows, csv, csvHref: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
        noPhone: result.noPhone, skippedActive: result.skippedActive, days, batchId: result.batchId,
    });
}
