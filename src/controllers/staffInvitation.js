import * as AuditLog from "../models/auditLog.js";
import * as User from "../models/user.js";
import { staffInviteMessage } from "../email/messages.js";
import { withTransaction } from "../db/transaction.js";
import { hashPassword } from "../utils/password.js";
import { parseId, validateResetPassword } from "../utils/validation.js";
import { createStaffInviteToken, readEmailActionClaims, verifyStaffInviteToken } from "../utils/emailActionToken.js";
import { makeEmailActionUrl } from "../utils/emailActionUrl.js";

function renderSetupForm(res, { token = "", errors = [], invalid = false, status = 200 } = {}) {
    res.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer");
    res.status(status).render("staff-invite-setup", { title: "Set Up Your Account", token, errors, invalid });
}

export function createStaffInvitationController({ tokenSecret }) {
    async function findInviteUser(db, token) {
        const claims = readEmailActionClaims(token);
        const userId = parseId(claims?.sub);

        if (!claims || !userId) {
            return null;
        }

        const user = await User.findById(db, userId);

        if (!verifyStaffInviteToken(token, user, tokenSecret)) {
            return null;
        }

        return user;
    }

    return {
        async showSetup(req, res) {
            const user = await findInviteUser(req.app.locals.db, req.params.token);

            if (!user) {
                return renderSetupForm(res, { invalid: true, status: 400 });
            }

            renderSetupForm(res, { token: req.params.token });
        },

        async accept(req, res) {
            const { password, errors } = validateResetPassword(req.body);

            if (errors.length > 0) {
                return renderSetupForm(res, { errors, token: req.params.token, status: 400 });
            }

            const user = await findInviteUser(req.app.locals.db, req.params.token);

            if (!user) {
                return renderSetupForm(res, { invalid: true, status: 400 });
            }

            const passwordHash = await hashPassword(password);
            const accepted = await withTransaction(req.app.locals.db, async (client) => {
                const locked = await User.findByIdForUpdate(client, user.id);

                if (!verifyStaffInviteToken(req.params.token, locked, tokenSecret)) {
                    return false;
                }

                await User.setPasswordHash(client, locked.id, passwordHash);
                await User.endOtherSessions(client, locked.id);
                await AuditLog.record(client, {
                    companyId: locked.companyId, actorId: locked.id, action: "password_changed", targetId: locked.id,
                });
                return true;
            });

            if (!accepted) {
                return renderSetupForm(res, { invalid: true, status: 400 });
            }

            res.redirect("/login?invite=accepted");
        },
    };
}

export async function sendStaffInvitation(req, user) {
    const { emailSender, appBaseUrl, tokenSecret, nodeEnv } = req.app.locals.staffInviteConfig;

    if (!emailSender?.configured || !appBaseUrl || !tokenSecret) {
        return { error: "not_configured" };
    }

    try {
        const token = createStaffInviteToken(user, tokenSecret);
        const url = makeEmailActionUrl(appBaseUrl, "/staff-invite", token, nodeEnv);
        await emailSender.send({ to: user.email, ...staffInviteMessage(url, user.role) });
        return { ok: true };
    } catch {
        console.error("Staff invitation email could not be sent through Resend.");
        return { error: "send_failed" };
    }
}
