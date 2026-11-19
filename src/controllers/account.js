import * as User from "../models/user.js";
import * as AuditLog from "../models/auditLog.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { validatePasswordChange, validateNewEmail } from "../utils/validation.js";
import { regenerateSession } from "../utils/session.js";
import { notFound } from "../utils/errors.js";
import { withTransaction } from "../db/transaction.js";

// Changing your own password. Only a user who has one can: a customer who signs in by link has no email or password, so
// the page does not exist for them.
async function loadUser(req) {
    const user = await User.findById(req.app.locals.db, req.session.user.id);

    if (!user || !user.password_hash) {
        throw notFound();
    }

    return user;
}

export async function showPassword(req, res) {
    await loadUser(req);
    res.render("account/password", { title: "Change Password", errors: [], notice: null });
}

export async function showEmail(req, res) {
    const user = await loadUser(req);
    res.render("account/email", { title: "Change Email", errors: [], notice: null, current: user.email });
}

export async function changeEmail(req, res) {
    const user = await loadUser(req);
    const { email, errors } = validateNewEmail(req.body, { confirmed: true });
    const page = (status, notice, shown) => {
        return res.status(status).render("account/email", { title: "Change Email", errors, notice, current: shown });
    };

    // The password is asked for so a stolen logged-in session cannot point the login at another address.
    if (!await verifyPassword(String(req.body.current ?? ""), user.password_hash)) {
        errors.unshift("The current password is not right.");
    }

    if (errors.length > 0) {
        return page(400, null, user.email);
    }

    const result = await withTransaction(req.app.locals.db, async (client) => {
        const changed = await User.setEmail(client, user.id, email);

        if (changed === true) {
            await AuditLog.record(client, {
                companyId: user.companyId, actorId: user.id, action: "email_changed", targetId: user.id,
                details: { from: user.email, to: email },
            });
        }

        return changed;
    });

    if (result === "taken") {
        errors.push("That email already has a login.");
        return page(400, null, user.email);
    }

    req.session.user.email = email;
    req.session.user.displayName = email;
    return page(200, "Your email was changed.", email);
}

export async function changePassword(req, res) {
    const user = await loadUser(req);
    const { current, password, errors } = validatePasswordChange(req.body);
    const rightCurrent = await verifyPassword(current, user.password_hash);

    if (!rightCurrent && current !== "") {
        errors.unshift("The current password is not right.");
    }

    if (errors.length > 0) {
        return res.status(400).render("account/password", { title: "Change Password", errors, notice: null });
    }

    const db = req.app.locals.db;
    const passwordHash = await hashPassword(password);
    // A new session id first, so the sessions to end are all the user's others.
    const session = req.session.user;
    await regenerateSession(req);
    req.session.user = session;
    // The new hash and the ending of the other sessions go together or not at all: a failure cannot leave the password
    // changed with an old login still alive.
    await withTransaction(db, async (client) => {
        await User.setPasswordHash(client, user.id, passwordHash);
        await User.endOtherSessions(client, user.id, req.sessionID);
        await AuditLog.record(client, {
            companyId: user.companyId, actorId: user.id, action: "password_changed", targetId: user.id,
        });
    });
    res.render("account/password", { title: "Change Password", errors: [], notice: "Your password was changed." });
}
