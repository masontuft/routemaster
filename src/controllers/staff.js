import * as Staff from "../models/staff.js";
import * as Customer from "../models/customer.js";
import * as Property from "../models/property.js";
import * as ServiceRequest from "../models/serviceRequest.js";
import * as ContactMessage from "../models/contactMessage.js";
import * as AccessLink from "../models/accessLink.js";
import { notFound } from "../utils/errors.js";
import { parseId, validatePreferredDate, validateProperty, todayString } from "../utils/validation.js";
import { STATUSES, allowedNext } from "../utils/transitions.js";

const TRANSITION_ERRORS = {
    not_found: null,
    transition: "That status change is not allowed from the current status.",
    unmatched: "Match this request to a customer before moving it forward.",
    date: "Choose a scheduled date.",
};

async function loadRequest(req) {
    const id = parseId(req.params.id);
    const request = id && await Staff.findRequest(req.app.locals.db, id);

    if (!request) {
        throw notFound();
    }

    return request;
}

async function renderRequest(req, res, request, { errors = [], status = 200 } = {}) {
    const history = await Staff.historyFor(req.app.locals.db, request.id);
    res.status(status).render("staff/request", {
        title: `Request ${request.id}`, request, history, errors, today: todayString(),
        next: allowedNext(request.status).filter((name) => {
            return request.customer_id || name === "Cancelled";
        }),
    });
}

export async function dashboard(req, res) {
    const db = req.app.locals.db;
    const [counts, review, stats, newMessages] = await Promise.all([
        Staff.countsByStatus(db),
        Staff.listRequests(db, { status: "Needs Review", limit: 5 }),
        req.session.user.role === "owner" ? Staff.stats(db) : null,
        ContactMessage.countNew(db),
    ]);
    res.render("staff/index", { title: "Staff Dashboard", counts, review, stats, newMessages });
}

export async function listRequests(req, res) {
    // An unknown filter is ignored rather than passed on.
    const status = STATUSES.includes(req.query.status) ? req.query.status : null;
    const requests = await Staff.listRequests(req.app.locals.db, { status });
    res.render("staff/requests", { title: "Requests", requests, status, statuses: STATUSES });
}

export async function showRequest(req, res) {
    await renderRequest(req, res, await loadRequest(req));
}

export async function changeStatus(req, res) {
    const request = await loadRequest(req);
    const to = String(req.body.status ?? "");
    const note = String(req.body.note ?? "").trim().slice(0, 500);
    const scheduledDate = String(req.body.scheduledDate ?? "");
    const dateError = to === "Scheduled" ? validatePreferredDate(scheduledDate) : null;
    const result = dateError
        ? { error: "date" }
        : await Staff.changeStatus(req.app.locals.db, request.id, {
            to, scheduledDate, note, changedBy: req.session.user.id,
        });

    if (result.error === "not_found") {
        throw notFound();
    }

    if (result.error) {
        const message = result.error === "date" && dateError ? dateError : TRANSITION_ERRORS[result.error];
        return renderRequest(req, res, await loadRequest(req), { errors: [message], status: 400 });
    }

    res.redirect(`/staff/requests/${request.id}`);
}

async function renderMatch(req, res, request, { errors = [], status = 200 } = {}) {
    const db = req.app.locals.db;
    const q = String(req.query.q ?? request.contact_name ?? "").trim().slice(0, 100);
    const customers = await Customer.search(db, q);
    const properties = await Property.listForCustomers(db, customers.map((customer) => {
        return customer.id;
    }));
    res.status(status).render("staff/match", {
        title: `Match Request ${request.id}`, request, q, errors,
        customers: customers.map((customer) => {
            return {
                ...customer,
                properties: properties.filter((property) => {
                    return property.customer_id === customer.id;
                }),
            };
        }),
    });
}

export async function showMatch(req, res) {
    const request = await loadRequest(req);

    if (request.status !== "Needs Review") {
        return res.redirect(`/staff/requests/${request.id}`);
    }

    await renderMatch(req, res, request);
}

async function finishMatch(req, res, request, result) {
    if (result.error === "not_found") {
        throw notFound();
    }

    if (result.error) {
        const message = result.error === "property" ? "Choose a property from the list." : TRANSITION_ERRORS.transition;
        return renderMatch(req, res, request, { errors: [message], status: 400 });
    }

    res.redirect(`/staff/requests/${request.id}`);
}

export async function matchExisting(req, res) {
    const request = await loadRequest(req);
    const propertyId = parseId(req.body.propertyId);
    const result = propertyId
        ? await Staff.matchToProperty(req.app.locals.db, request.id, propertyId, req.session.user.id)
        : { error: "property" };
    await finishMatch(req, res, request, result);
}

export async function matchNew(req, res) {
    const request = await loadRequest(req);
    const { values, errors } = validateProperty({
        street: request.contact_address, city: req.body.city, zip: req.body.zip,
    });

    if (errors.length) {
        return renderMatch(req, res, request, { errors, status: 400 });
    }

    const result = await Staff.matchAsNew(req.app.locals.db, request.id, values, req.session.user.id);
    await finishMatch(req, res, request, result);
}

export async function listCustomers(req, res) {
    const q = String(req.query.q ?? "").trim().slice(0, 100);
    const customers = await Customer.search(req.app.locals.db, q);
    res.render("staff/customers", { title: "Customers", customers, q });
}

async function renderCustomer(req, res, { newLink = null } = {}) {
    const db = req.app.locals.db;
    const id = parseId(req.params.id);
    const customer = id && await Customer.findById(db, id);

    if (!customer) {
        throw notFound();
    }

    const [properties, requests, links] = await Promise.all([
        Property.listForCustomer(db, customer.id),
        ServiceRequest.listForCustomer(db, customer.id),
        AccessLink.listForCustomer(db, customer.id),
    ]);
    // A token only ever appears in the response to the POST that made it, never in a URL or the session.
    res.set("Cache-Control", "no-store");
    res.render("staff/customer", { title: customer.name, customer, properties, requests, links, newLink });
}

export async function showCustomer(req, res) {
    await renderCustomer(req, res);
}

export async function createLink(req, res) {
    const db = req.app.locals.db;
    const id = parseId(req.params.id);

    if (!id || !await Customer.findById(db, id)) {
        throw notFound();
    }

    const token = await AccessLink.create(db, { customerId: id, createdBy: req.session.user.id });
    await renderCustomer(req, res, { newLink: `${req.protocol}://${req.get("host")}/l/${token}` });
}

export async function revokeLink(req, res) {
    const customerId = parseId(req.params.id);
    const linkId = parseId(req.params.linkId);

    if (!customerId || !linkId || !await AccessLink.revokeForCustomer(req.app.locals.db, linkId, customerId)) {
        throw notFound();
    }

    res.redirect(`/staff/customers/${customerId}`);
}
