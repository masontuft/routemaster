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

// The page that shows made batches once. Shared with the rebooking page, which makes batches for ticked customers.
// A section is one area's batch: create's result plus the area's name, or just an error for an area that failed.
export async function renderResults(req, res, { template, days, sections }) {
    const origin = `${req.protocol}://${req.get("host")}`;
    const made = sections.filter((section) => {
        return !section.error && section.rows.length > 0;
    }).map((section) => {
        const rows = section.rows.map((row) => {
            return { name: row.name, phone: normalizePhone(row.phone), message: messageFor(template, row.name, `${origin}/l/${row.token}`) };
        });
        const csv = toCsv([["name", "phone", "message"], ...rows.map((row) => {
            return [row.name, row.phone, row.message];
        })]);
        return {
            areaName: section.areaName, batchId: section.batchId, rows, csv,
            csvHref: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
        };
    });
    const failed = sections.filter((section) => {
        return section.error;
    }).map((section) => {
        const reasons = {
            too_many: `${section.count} customers is more than the ${LinkBatch.MAX_BATCH} a batch holds, so tick fewer of them and try again`,
            not_found: "the area no longer exists",
        };
        return { areaName: section.areaName, reason: reasons[section.error] ?? "something went wrong, so nothing was made; try again, and customers who already have a working link are skipped" };
    });
    const noPhone = sections.flatMap((section) => {
        return section.noPhone ?? [];
    });
    const skippedActive = sections.reduce((total, section) => {
        return total + (section.skippedActive ?? 0);
    }, 0);
    const linkCount = made.reduce((total, section) => {
        return total + section.rows.length;
    }, 0);

    // The links exist only in this response. Refreshing it would run the batches again.
    res.set("Cache-Control", "no-store");
    res.render("staff/link-batch-result", {
        title: "Scheduling Links", sections: made, failed, noPhone, skippedActive, linkCount, days,
    });
}

export async function renderResult(req, res, { areaId, template, days, result }) {
    const area = await Area.find(req.app.locals.db, areaId);
    await renderResults(req, res, { template, days, sections: [{ areaName: area.name, ...result }] });
}
