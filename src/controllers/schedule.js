import * as Customer from "../models/customer.js";
import * as Lead from "../models/lead.js";
import * as ServiceRequest from "../models/serviceRequest.js";
import * as ServiceType from "../models/serviceType.js";
import { parseId, validateIdentity, validatePreferredDate, todayString } from "../utils/validation.js";
import { publicCompanyId } from "../utils/company.js";

export function showIdentify(req, res) {
    res.render("schedule/identify", { title: "Schedule Service", errors: [], values: {} });
}

export function identify(req, res) {
    const { values, errors } = validateIdentity(req.body);

    if (errors.length) {
        return res.status(400).render("schedule/identify", { title: "Schedule Service", errors, values });
    }

    // The details remember which company's page they were typed on, so a flow started on one company's page cannot be
    // finished on another's.
    req.session.schedule = { ...values, companyId: publicCompanyId(req) };
    res.redirect(`${res.locals.base}/schedule/date`);
}

async function dateForm(req, res, status, errors, values) {
    const types = await ServiceType.listActive(req.app.locals.db, publicCompanyId(req));
    res.status(status).render("schedule/date", { title: "Choose a Date", types, today: todayString(), errors, values });
}

// The identity step of this company's page, or null: nothing typed yet, or typed on another company's page.
function startedHere(req) {
    const started = req.session.schedule;
    return started && started.companyId === publicCompanyId(req) ? started : null;
}

export async function showDate(req, res) {
    if (!startedHere(req)) {
        return res.redirect(`${res.locals.base}/schedule`);
    }

    await dateForm(req, res, 200, [], {});
}

// A match and a miss look the same to the visitor, so this page cannot be used to look up customers.
export async function submitDate(req, res) {
    const contact = startedHere(req);

    if (!contact) {
        return res.redirect(`${res.locals.base}/schedule`);
    }

    const db = req.app.locals.db;
    const companyId = publicCompanyId(req);
    const serviceTypeId = parseId(req.body.serviceTypeId);
    const preferredDate = String(req.body.preferredDate ?? "");
    const errors = [];

    if (!serviceTypeId || !await ServiceType.findActive(db, companyId, serviceTypeId)) {
        errors.push("Choose a service.");
    }

    const dateError = validatePreferredDate(preferredDate);

    if (dateError) {
        errors.push(dateError);
    }

    if (errors.length) {
        return dateForm(req, res, 400, errors, { serviceTypeId, preferredDate });
    }

    // No match: the visitor becomes a lead, and asking again reuses that lead instead of copying their details.
    // The bare /schedule takes requests for the first company, and /w/<slug>/schedule for that company.
    const match = await Customer.findByContact(db, companyId, contact);
    const leadId = match ? null : await Lead.findOrCreate(db, companyId, contact);
    await ServiceRequest.create(db, companyId, {
        customerId: match?.customer_id,
        propertyId: match?.property_id,
        leadId,
        serviceTypeId,
        preferredDate,
    });

    delete req.session.schedule;
    res.redirect(`${res.locals.base}/schedule/thanks`);
}

export function thanks(req, res) {
    res.render("schedule/thanks", { title: "Request Received" });
}
