import * as Staff from "../models/staff.js";
import * as Customer from "../models/customer.js";
import * as Property from "../models/property.js";
import * as Area from "../models/area.js";
import * as ServiceRequest from "../models/serviceRequest.js";
import * as ContactMessage from "../models/contactMessage.js";
import * as AccessLink from "../models/accessLink.js";
import { notFound, forbidden } from "../utils/errors.js";
import { editableFields, refusedFields } from "../utils/permissions.js";
import {
    parseId, validatePreferredDate, validateProperty, validateCustomerEdit, validatePropertyEdit, todayString,
} from "../utils/validation.js";
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

const REFERRER_MAX = 100;

export async function setReferrer(req, res) {
    const request = await loadRequest(req);
    const referredBy = String(req.body.referredBy ?? "").trim();

    if (referredBy.length > REFERRER_MAX) {
        return renderRequest(req, res, { ...request, referred_by: referredBy }, {
            errors: ["Referred by must be 100 characters or fewer."],
            status: 400,
        });
    }

    const saved = await Staff.setReferrer(req.app.locals.db, request.id, referredBy === "" ? null : referredBy);

    if (!saved) {
        throw notFound();
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
    const needsCity = req.query.needs === "city";
    const customers = await Customer.search(req.app.locals.db, q, { needsCity });
    res.render("staff/customers", { title: "Customers", customers, q, needsCity });
}

async function renderCustomer(req, res, { newLink = null, errors = [], propertyValues = {}, status = 200 } = {}) {
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
    res.status(status).render("staff/customer", {
        title: customer.name, customer, properties, requests, links, newLink, errors, propertyValues,
    });
}

export async function showCustomer(req, res) {
    await renderCustomer(req, res);
}

async function loadCustomer(req) {
    const id = parseId(req.params.id);
    const customer = id && await Customer.findById(req.app.locals.db, id);

    if (!customer) {
        throw notFound();
    }

    return customer;
}

function customerEditPage(req, res, { customer, values, errors = [], status = 200 }) {
    res.status(status).render("staff/customer-edit", {
        title: "Edit Customer", customer, values, errors, editable: editableFields("customer", req.session.user.role),
    });
}

export async function showCustomerEdit(req, res) {
    const customer = await loadCustomer(req);
    customerEditPage(req, res, { customer, values: customer });
}

// The role's allowed fields are enforced here, not only by which inputs the form shows.
export async function updateCustomer(req, res) {
    const customer = await loadCustomer(req);
    const { role } = req.session.user;

    if (refusedFields("customer", role, req.body).length > 0) {
        throw forbidden();
    }

    const { values, errors } = validateCustomerEdit(req.body, editableFields("customer", role));

    if (errors.length > 0) {
        return customerEditPage(req, res, { customer, values: { ...customer, ...values }, errors, status: 400 });
    }

    await Customer.update(req.app.locals.db, customer.id, values);
    res.redirect(303, `/staff/customers/${customer.id}`);
}

export async function addProperty(req, res) {
    const customer = await loadCustomer(req);
    const { values, errors } = validateProperty(req.body);

    if (errors.length > 0) {
        return renderCustomer(req, res, { errors, propertyValues: values, status: 400 });
    }

    await Property.create(req.app.locals.db, customer.id, values);
    res.redirect(303, `/staff/customers/${customer.id}`);
}

async function loadProperty(req) {
    const id = parseId(req.params.id);
    const property = id && await Property.findById(req.app.locals.db, id);

    if (!property) {
        throw notFound();
    }

    return property;
}

async function propertyEditPage(req, res, { property, values, errors = [], status = 200 }) {
    const areas = await Area.list(req.app.locals.db, todayString());
    res.status(status).render("staff/property-edit", {
        title: "Edit Property", property, values, errors, areas, editable: editableFields("property", req.session.user.role),
    });
}

export async function showPropertyEdit(req, res) {
    const property = await loadProperty(req);
    await propertyEditPage(req, res, { property, values: property });
}

export async function updateProperty(req, res) {
    const property = await loadProperty(req);
    const { role } = req.session.user;

    if (refusedFields("property", role, req.body).length > 0) {
        throw forbidden();
    }

    const { values, errors } = validatePropertyEdit(req.body, editableFields("property", role));

    if (values.subdivisionId && !await Area.find(req.app.locals.db, values.subdivisionId)) {
        errors.push("Choose an area from the list.");
    }

    if (errors.length > 0) {
        return propertyEditPage(req, res, { property, values: { ...property, ...values }, errors, status: 400 });
    }

    await Property.update(req.app.locals.db, property.id, values);
    res.redirect(303, `/staff/customers/${property.customer_id}`);
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

// Deleting is owner-only and checked here, not only by hiding the link. The page shows what will go first.
function requireOwner(req) {
    if (req.session.user.role !== "owner") {
        throw forbidden();
    }
}

export async function showCustomerDelete(req, res) {
    requireOwner(req);
    const customer = await loadCustomer(req);
    const counts = await Customer.countRelated(req.app.locals.db, customer.id);
    res.set("Cache-Control", "no-store");
    res.render("staff/customer-delete", { title: "Delete Customer", customer, counts });
}

export async function deleteCustomer(req, res) {
    requireOwner(req);
    const customer = await loadCustomer(req);
    await Customer.remove(req.app.locals.db, customer.id);
    res.redirect(303, "/staff/customers");
}

// Staff mark a penciled-in booking confirmed. Does nothing for a request that is not tentative.
export async function confirmTentative(req, res) {
    const request = await loadRequest(req);
    await Staff.confirmTentative(req.app.locals.db, request.id, req.session.user.id);
    res.redirect(`/staff/requests/${request.id}`);
}
