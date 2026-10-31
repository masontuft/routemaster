import * as ServiceRequest from "../models/serviceRequest.js";
import * as Property from "../models/property.js";
import * as ServiceType from "../models/serviceType.js";
import { notFound } from "../utils/errors.js";
import { parseId, validatePreferredDate, todayString } from "../utils/validation.js";

async function formData(req, extra = {}) {
    const db = req.app.locals.db;
    const [properties, types] = await Promise.all([
        Property.listForCustomer(db, req.session.user.customerId),
        ServiceType.listActive(db),
    ]);
    return { properties, types, today: todayString(), errors: [], values: {}, ...extra };
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
    res.render("requests/new", { title: "New Request", ...await formData(req) });
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

    if (!propertyId || !await Property.findForCustomer(db, propertyId, customerId)) {
        errors.push("Choose one of your properties.");
    }

    const dateError = validatePreferredDate(preferredDate);

    if (dateError) {
        errors.push(dateError);
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
    const history = await ServiceRequest.historyFor(req.app.locals.db, request.id);
    res.render("requests/show", { title: `Request ${request.id}`, request, history });
}

export async function showEdit(req, res) {
    const request = await ownedRequest(req);
    res.render("requests/edit", {
        title: "Change Request", request, errors: [], today: todayString(),
        values: { preferredDate: request.preferred_date.toISOString().slice(0, 10), notes: request.notes ?? "" },
    });
}

export async function update(req, res) {
    const request = await ownedRequest(req);
    const preferredDate = String(req.body.preferredDate ?? "");
    const notes = String(req.body.notes ?? "").trim().slice(0, 500);
    const dateError = validatePreferredDate(preferredDate);
    const saved = !dateError && await ServiceRequest.updateDetails(
        req.app.locals.db, request.id, req.session.user.customerId, { preferredDate, notes },
    );

    if (!saved) {
        const errors = [dateError ?? "Only a request that is still Requested can be changed."];
        return res.status(400).render("requests/edit", {
            title: "Change Request", request, errors, today: todayString(), values: { preferredDate, notes },
        });
    }

    res.redirect(`/requests/${request.id}`);
}

export async function cancel(req, res) {
    const request = await ownedRequest(req);
    await ServiceRequest.cancel(req.app.locals.db, request.id, req.session.user.customerId, req.session.user.id);
    res.redirect(`/requests/${request.id}`);
}
