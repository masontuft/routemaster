import * as Admin from "../models/admin.js";
import * as AuditLog from "../models/auditLog.js";
import * as ServiceType from "../models/serviceType.js";
import { hashPassword } from "../utils/password.js";
import { notFound } from "../utils/errors.js";
import { parseId, validateNewEmail, validateRegistration } from "../utils/validation.js";
import { parsePriceCents } from "../utils/money.js";
import { companyOf } from "../utils/company.js";
import { sendStaffInvitation } from "./staffInvitation.js";

const STAFF_ROLES = ["owner", "dispatcher"];

const ROLE_ERRORS = {
    self: "You cannot change your own role.",
    no_login: "That customer signs in by link and has no password login.",
    role: "Choose a valid role.",
    last_owner: "There must always be at least one owner.",
};

async function renderUsers(req, res, { errors = [], notice = null, status = 200 } = {}) {
    const db = req.app.locals.db;
    const [users, roles] = await Promise.all([Admin.listUsers(db, companyOf(req)), Admin.listRoles(db)]);
    res.status(status).render("admin/users", { title: "Users", users, roles, errors, notice });
}

export async function listUsers(req, res) {
    const notice = req.query.invite === "sent"
        ? "The invitation email was sent."
        : req.query.invite === "resent" ? "The invitation email was sent again." : null;
    await renderUsers(req, res, { notice });
}

const EMAIL_ERRORS = {
    self: "Change your own email on the account page.",
    no_login: "That customer signs in by link and has no email login.",
    taken: "That email already has a login.",
};

export async function showAudit(req, res) {
    res.set("Cache-Control", "no-store");
    res.render("admin/audit", { title: "Audit Log", entries: await AuditLog.list(req.app.locals.db, companyOf(req)) });
}

export async function changeEmail(req, res) {
    const id = parseId(req.params.id);
    const { email, errors } = validateNewEmail(req.body);

    if (id && errors.length > 0) {
        return renderUsers(req, res, { errors, status: 400 });
    }

    const result = id
        ? await Admin.changeEmail(req.app.locals.db, companyOf(req), id, email, req.session.user.id)
        : { error: "not_found" };

    if (result.error === "not_found") {
        throw notFound();
    }

    if (result.error) {
        return renderUsers(req, res, { errors: [EMAIL_ERRORS[result.error]], status: 400 });
    }

    res.redirect("/admin/users");
}

export async function changeRole(req, res) {
    const id = parseId(req.params.id);
    const result = id
        ? await Admin.changeRole(req.app.locals.db, companyOf(req), id, String(req.body.role ?? ""), req.session.user.id)
        : { error: "not_found" };

    if (result.error === "not_found") {
        throw notFound();
    }

    if (result.error) {
        return renderUsers(req, res, { errors: [ROLE_ERRORS[result.error]], status: 400 });
    }

    res.redirect("/admin/users");
}

export function showNewUser(req, res) {
    res.render("admin/user-new", { title: "New Staff User", errors: [], values: { email: "", role: "dispatcher" } });
}

export async function createUser(req, res) {
    const { email, password, errors } = validateRegistration(req.body);
    const role = String(req.body.role ?? "");

    if (!STAFF_ROLES.includes(role)) {
        errors.push("Choose a staff role.");
    }

    const created = errors.length === 0 && await Admin.createStaff(
        req.app.locals.db, companyOf(req), req.session.user.id,
        { email, passwordHash: await hashPassword(password), roleName: role },
    );

    if (errors.length === 0 && !created) {
        errors.push("That email is already registered.");
    }

    if (errors.length) {
        return res.status(400).render("admin/user-new", { title: "New Staff User", errors, values: { email, role } });
    }

    res.redirect("/admin/users");
}

export function showInviteUser(req, res) {
    res.set("Cache-Control", "no-store");
    res.render("admin/user-invite", { title: "Invite Staff", errors: [], values: { email: "", role: "dispatcher" } });
}

export async function inviteUser(req, res) {
    const { email, errors } = validateNewEmail(req.body);
    const role = String(req.body.role ?? "");
    const config = req.app.locals.staffInviteConfig;

    if (!STAFF_ROLES.includes(role)) {
        errors.push("Choose a staff role.");
    }

    if (errors.length === 0 && (!config.emailSender?.configured || !config.appBaseUrl || !config.tokenSecret)) {
        errors.push("Staff invitation email is not configured. No user was created.");
    }

    if (errors.length > 0) {
        return res.status(400).render("admin/user-invite", {
            title: "Invite Staff", errors, values: { email, role },
        });
    }

    const user = await Admin.createStaff(req.app.locals.db, companyOf(req), req.session.user.id, {
        email, passwordHash: null, roleName: role,
    });

    if (!user) {
        return res.status(400).render("admin/user-invite", {
            title: "Invite Staff", errors: ["That email is already registered."], values: { email, role },
        });
    }

    const sent = await sendStaffInvitation(req, user);

    if (!sent.ok) {
        return renderUsers(req, res, {
            errors: ["The staff account was created, but the invitation email could not be sent. Use Resend Invitation on that account to try again."],
            status: 502,
        });
    }

    res.redirect("/admin/users?invite=sent");
}

export async function resendInvite(req, res) {
    const id = parseId(req.params.id);
    const user = id ? await Admin.findPendingStaffInvite(req.app.locals.db, companyOf(req), id) : null;

    if (!user) {
        throw notFound();
    }

    const sent = await sendStaffInvitation(req, user);

    if (!sent.ok) {
        const message = sent.error === "not_configured"
            ? "Staff invitation email is not configured."
            : "The invitation email could not be sent. Please try again.";
        return renderUsers(req, res, { errors: [message], status: 502 });
    }

    res.redirect("/admin/users?invite=resent");
}

export async function listServiceTypes(req, res) {
    res.render("admin/service-types", { title: "Services", types: await ServiceType.listAll(req.app.locals.db, companyOf(req)) });
}

function renderTypeForm(res, { type, errors = [], values, status = 200 }) {
    const title = type ? "Edit Service" : "New Service";
    res.status(status).render("admin/service-type-form", { title, type, errors, values });
}

export function showNewServiceType(req, res) {
    renderTypeForm(res, { type: null, values: { name: "", price: "0.00", active: true } });
}

function readType(body) {
    const name = String(body.name ?? "").trim();
    const price = String(body.price ?? "").trim();
    const priceCents = parsePriceCents(price);
    const errors = [];

    if (!name || name.length > 80) {
        errors.push("Enter a service name of up to 80 characters.");
    }

    if (priceCents === null) {
        errors.push("Enter a price like 45 or 45.50, up to 99999.99.");
    }

    return { values: { name, price, active: body.active === "on" }, priceCents, errors };
}

async function saveType(req, res, type) {
    const { values, priceCents, errors } = readType(req.body);
    const db = req.app.locals.db;
    const input = { name: values.name, priceCents, active: values.active };
    let result = null;

    if (errors.length === 0) {
        result = type
            ? await ServiceType.update(db, companyOf(req), type.id, input)
            : await ServiceType.create(db, companyOf(req), input);
    }

    if (result?.error) {
        errors.push("A service with that name already exists.");
    }

    if (errors.length) {
        return renderTypeForm(res, { type, errors, values, status: 400 });
    }

    res.redirect("/admin/service-types");
}

export async function createServiceType(req, res) {
    await saveType(req, res, null);
}

async function loadType(req) {
    const id = parseId(req.params.id);
    const type = id && await ServiceType.findById(req.app.locals.db, companyOf(req), id);

    if (!type) {
        throw notFound();
    }

    return type;
}

export async function showEditServiceType(req, res) {
    const type = await loadType(req);
    const price = (type.price_cents / 100).toFixed(2);
    renderTypeForm(res, { type, values: { name: type.name, price, active: type.active } });
}

export async function updateServiceType(req, res) {
    await saveType(req, res, await loadType(req));
}
