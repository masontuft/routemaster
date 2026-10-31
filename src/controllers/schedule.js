import * as Customer from "../models/customer.js";
import * as ServiceRequest from "../models/serviceRequest.js";
import * as ServiceType from "../models/serviceType.js";
import { parseId, validateIdentity, validatePreferredDate, todayString } from "../utils/validation.js";

export function showIdentify(req, res) {
    res.render("schedule/identify", { title: "Schedule Service", errors: [], values: {} });
}

export function identify(req, res) {
    const { values, errors } = validateIdentity(req.body);

    if (errors.length) {
        return res.status(400).render("schedule/identify", { title: "Schedule Service", errors, values });
    }

    req.session.schedule = values;
    res.redirect("/schedule/date");
}

async function dateForm(req, res, status, errors, values) {
    const types = await ServiceType.listActive(req.app.locals.db);
    res.status(status).render("schedule/date", { title: "Choose a Date", types, today: todayString(), errors, values });
}

export async function showDate(req, res) {
    if (!req.session.schedule) {
        return res.redirect("/schedule");
    }

    await dateForm(req, res, 200, [], {});
}

// A match and a miss look the same to the visitor, so this page cannot be used to look up customers.
export async function submitDate(req, res) {
    const contact = req.session.schedule;

    if (!contact) {
        return res.redirect("/schedule");
    }

    const db = req.app.locals.db;
    const serviceTypeId = parseId(req.body.serviceTypeId);
    const preferredDate = String(req.body.preferredDate ?? "");
    const errors = [];

    if (!serviceTypeId || !await ServiceType.findActive(db, serviceTypeId)) {
        errors.push("Choose a service.");
    }

    const dateError = validatePreferredDate(preferredDate);

    if (dateError) {
        errors.push(dateError);
    }

    if (errors.length) {
        return dateForm(req, res, 400, errors, { serviceTypeId, preferredDate });
    }

    const match = await Customer.findByContact(db, contact);
    await ServiceRequest.create(db, {
        customerId: match?.customer_id,
        propertyId: match?.property_id,
        serviceTypeId,
        preferredDate,
        contact: match ? undefined : contact,
    });

    delete req.session.schedule;
    res.redirect("/schedule/thanks");
}

export function thanks(req, res) {
    res.render("schedule/thanks", { title: "Request Received" });
}
