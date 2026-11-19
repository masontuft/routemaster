import * as User from "../models/user.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { validatePasswordChange } from "../utils/validation.js";
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
    });
    res.render("account/password", { title: "Change Password", errors: [], notice: "Your password was changed." });
}
