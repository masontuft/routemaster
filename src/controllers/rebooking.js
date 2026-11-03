import * as Area from "../models/area.js";
import * as LinkBatch from "../models/linkBatch.js";
import * as Rebooking from "../models/rebooking.js";
import { renderResult } from "./linkBatches.js";
import { notFound } from "../utils/errors.js";
import { normalizePhone } from "../utils/normalize.js";
import { parseId, todayString, validateRebooking, DEFAULT_REBOOK_MESSAGE } from "../utils/validation.js";

// Names and phones, so the page is never cached.
async function page(req, res, options) {
    const { areaId, year, days = 30, template = DEFAULT_REBOOK_MESSAGE, errors = [], status = 200 } = options;
    const db = req.app.locals.db;
    const areas = await Area.list(db, todayString());
    const customers = areaId ? await Rebooking.forArea(db, areaId, year) : [];
    const counts = Rebooking.countByGroup(customers);

    res.set("Cache-Control", "no-store");
    res.status(status).render("staff/rebooking", {
        title: "Rebooking", areas, areaId, year, days, template, errors, counts,
        groups: Rebooking.GROUPS.map((group) => {
            return {
                key: group,
                customers: customers.filter((customer) => {
                    return customer.group === group;
                }).map((customer) => {
                    return { ...customer, textable: normalizePhone(customer.phone ?? "").length >= 10 };
                }),
            };
        }),
    });
}

function yearFrom(value) {
    const asked = /^\d{4}$/.test(String(value ?? "")) ? Number(value) : null;
    return asked && asked >= 2000 && asked <= 2100 ? asked : Number(todayString().slice(0, 4));
}

export async function show(req, res) {
    const areaId = parseId(req.query.areaId);
    const area = areaId ? await Area.find(req.app.locals.db, areaId) : null;
    await page(req, res, { areaId: area ? areaId : null, year: yearFrom(req.query.year) });
}

// Makes links for the ticked customers only, then shows them on the same one-time page as a link batch.
export async function makeLinks(req, res) {
    const { values, errors } = validateRebooking(req.body);

    if (errors.length > 0) {
        return page(req, res, {
            areaId: values.areaId, year: yearFrom(req.body.year), days: req.body.days,
            template: values.template, errors, status: 400,
        });
    }

    const result = await LinkBatch.create(req.app.locals.db, {
        areaId: values.areaId, createdBy: req.session.user.id, days: values.days,
        includeActive: values.includeActive, customerIds: values.customerIds,
    });

    if (result.error === "not_found") {
        throw notFound();
    }

    if (result.error === "too_many") {
        return page(req, res, {
            areaId: values.areaId, year: values.year, days: values.days, template: values.template, status: 400,
            errors: [`That would make ${result.count} links. A batch holds at most ${LinkBatch.MAX_BATCH}.`],
        });
    }

    await renderResult(req, res, { areaId: values.areaId, template: values.template, days: values.days, result });
}
