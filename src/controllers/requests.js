import * as ServiceRequest from "../models/serviceRequest.js";
import * as Property from "../models/property.js";
import * as Review from "../models/review.js";
import * as ServiceType from "../models/serviceType.js";
import * as Area from "../models/area.js";
import { dayLabel } from "../utils/dayLabel.js";
import { notFound } from "../utils/errors.js";
import { parseId, validatePreferredDate, todayString } from "../utils/validation.js";

function labelled(days) {
    return days.map((day) => {
        return { day, label: dayLabel(day) };
    });
}

// A customer picks from the days staff assigned to the area of the property being requested. The page shows one
// property at a time (the one in values.propertyId, else the first), so the list needs no script.
async function formData(req, extra = {}) {
    const db = req.app.locals.db;
    const [properties, types] = await Promise.all([
        Property.listForCustomer(db, req.session.user.customerId),
        ServiceType.listActive(db),
    ]);
    const values = extra.values ?? {};
    const selected = properties.find((property) => {
        return property.id === Number(values.propertyId);
    }) ?? properties[0] ?? null;
    const days = selected ? await Area.daysForProperty(db, selected.id, todayString()) : [];
    return {
        properties, selected, days: labelled(days), types, today: todayString(), errors: [], values: {}, ...extra,
    };
}

async function ownedRequest(req) {
    const id = parseId(req.params.id);
    const request = id && await ServiceRequest.findForCustomer(req.app.locals.db, id, req.session.user.customerId);

    if (!request) {
        throw notFound();
    }

    return request;
}

export async function list(req, res) {
    const requests = await ServiceRequest.listForCustomer(req.app.locals.db, req.session.user.customerId);
    res.render("requests/index", { title: "My Requests", requests });
}

export async function showNew(req, res) {
    const values = { propertyId: parseId(req.query.propertyId) };
    res.render("requests/new", { title: "New Request", ...await formData(req, { values }) });
}

export async function create(req, res) {
    const db = req.app.locals.db;
    const { customerId, id: userId } = req.session.user;
    const serviceTypeId = parseId(req.body.serviceTypeId);
    const propertyId = parseId(req.body.propertyId);
    const preferredDate = String(req.body.preferredDate ?? "");
    const notes = String(req.body.notes ?? "").trim().slice(0, 500);
    const errors = [];

    if (!serviceTypeId || !await ServiceType.findActive(db, serviceTypeId)) {
        errors.push("Choose a service.");
    }

    const property = propertyId && await Property.findForCustomer(db, propertyId, customerId);

    if (!property) {
        errors.push("Choose one of your properties.");
    }

    const dateError = validatePreferredDate(preferredDate);

    if (dateError) {
        errors.push(dateError);
    } else if (property) {
        // The list on the page is a convenience; this is the rule. When the area has days, any date outside them is
        // refused. When it has none (no area, or no upcoming days) the date is only a wish and staff pick the day.
        const days = await Area.daysForProperty(db, property.id, todayString());

        if (days.length > 0 && !days.includes(preferredDate)) {
            errors.push("Choose one of the available days.");
        }
    }

    if (errors.length) {
        const values = { serviceTypeId, propertyId, preferredDate, notes };
        return res.status(400).render("requests/new", { title: "New Request", ...await formData(req, { errors, values }) });
    }

    const id = await ServiceRequest.create(db, {
        customerId, propertyId, serviceTypeId, preferredDate, notes, changedBy: userId,
    });
    res.redirect(`/requests/${id}`);
}

export async function show(req, res) {
    const request = await ownedRequest(req);
    const db = req.app.locals.db;
    const history = await ServiceRequest.historyFor(db, request.id);
    const review = request.status === "Completed" ? await Review.findForRequest(db, request.id, req.session.user.customerId) : null;
    res.render("requests/show", { title: `Request ${request.id}`, request, history, review });
}

// The area's upcoming days, plus the day already on the request, so changing only the notes still works after a
// day has been taken off the list. An empty list means any date may be asked for.
async function editDays(req, request) {
    const days = await Area.daysForProperty(req.app.locals.db, request.property_id, todayString());

    if (days.length === 0) {
        return days;
    }

    return days.includes(request.preferred_day) || request.preferred_day < todayString()
        ? days
        : [...days, request.preferred_day].sort();
}

async function editPage(req, res, request, { errors = [], values, status = 200 }) {
    res.status(status).render("requests/edit", {
        title: "Change Request", request, errors, values, today: todayString(), days: labelled(await editDays(req, request)),
    });
}

export async function showEdit(req, res) {
    const request = await ownedRequest(req);
    await editPage(req, res, request, { values: { preferredDate: request.preferred_day, notes: request.notes ?? "" } });
}

export async function update(req, res) {
    const request = await ownedRequest(req);
    const preferredDate = String(req.body.preferredDate ?? "");
    const notes = String(req.body.notes ?? "").trim().slice(0, 500);
    let dateError = validatePreferredDate(preferredDate);

    if (!dateError && preferredDate !== request.preferred_day) {
        const days = await Area.daysForProperty(req.app.locals.db, request.property_id, todayString());

        if (days.length > 0 && !days.includes(preferredDate)) {
            dateError = "Choose one of the available days.";
        }
    }

    const saved = !dateError && await ServiceRequest.updateDetails(
        req.app.locals.db, request.id, req.session.user.customerId, { preferredDate, notes }, req.session.user.id,
    );

    if (!saved) {
        const errors = [dateError ?? "Only a request that is still Requested, or penciled in for you, can be changed."];
        return editPage(req, res, request, { errors, values: { preferredDate, notes }, status: 400 });
    }

    res.redirect(`/requests/${request.id}`);
}

export async function cancel(req, res) {
    const request = await ownedRequest(req);
    await ServiceRequest.cancel(req.app.locals.db, request.id, req.session.user.customerId, req.session.user.id);
    res.redirect(`/requests/${request.id}`);
}

// The customer accepts a day that staff penciled in for them.
export async function confirm(req, res) {
    const request = await ownedRequest(req);
    await ServiceRequest.confirm(req.app.locals.db, request.id, req.session.user.customerId, req.session.user.id);
    res.redirect(`/requests/${request.id}`);
}
