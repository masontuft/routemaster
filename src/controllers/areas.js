import * as Area from "../models/area.js";
import { notFound } from "../utils/errors.js";
import { dayLabel, WEEKDAYS } from "../utils/dayLabel.js";
import { parseId, todayString, validateAreaName, validateAreaDays } from "../utils/validation.js";

const NAME_TAKEN = "An area with that name already exists.";

async function listPage(req, res, { errors = [], values = {}, status = 200 } = {}) {
    const areas = await Area.list(req.app.locals.db, todayString());
    res.status(status).render("staff/areas", { title: "Areas", areas, errors, values });
}

export async function list(req, res) {
    await listPage(req, res);
}

export async function create(req, res) {
    const { name, errors } = validateAreaName(req.body.name);

    if (errors.length === 0 && await Area.create(req.app.locals.db, name) === null) {
        errors.push(NAME_TAKEN);
    }

    if (errors.length > 0) {
        return listPage(req, res, { errors, values: { name }, status: 400 });
    }

    res.redirect(303, "/staff/areas");
}

async function loadArea(req) {
    const id = parseId(req.params.id);
    const area = id && await Area.find(req.app.locals.db, id);

    if (!area) {
        throw notFound();
    }

    return area;
}

async function areaPage(req, res, area, { errors = [], values = {}, status = 200 } = {}) {
    const days = await Area.upcomingDays(req.app.locals.db, area.id, todayString());
    res.status(status).render("staff/area", {
        title: area.name, area, errors, values, today: todayString(), weekdays: WEEKDAYS,
        days: days.map((day) => {
            return { day, label: dayLabel(day) };
        }),
    });
}

export async function show(req, res) {
    await areaPage(req, res, await loadArea(req));
}

export async function rename(req, res) {
    const area = await loadArea(req);
    const { name, errors } = validateAreaName(req.body.name);

    if (errors.length === 0 && await Area.rename(req.app.locals.db, area.id, name) === false) {
        errors.push(NAME_TAKEN);
    }

    if (errors.length > 0) {
        return areaPage(req, res, area, { errors, values: { name }, status: 400 });
    }

    res.redirect(303, `/staff/areas/${area.id}`);
}

export async function addDays(req, res) {
    const area = await loadArea(req);
    const { days, errors } = validateAreaDays(req.body);

    if (errors.length > 0) {
        return areaPage(req, res, area, { errors, values: req.body, status: 400 });
    }

    await Area.addDays(req.app.locals.db, area.id, days);
    res.redirect(303, `/staff/areas/${area.id}`);
}

export async function removeDay(req, res) {
    const area = await loadArea(req);
    const day = String(req.body.day ?? "");

    // Only a real date reaches the query; anything else is treated as a day that is not there.
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) === false || await Area.removeDay(req.app.locals.db, area.id, day) === false) {
        throw notFound();
    }

    res.redirect(303, `/staff/areas/${area.id}`);
}
