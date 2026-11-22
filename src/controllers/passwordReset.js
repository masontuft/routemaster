import * as AuditLog from "../models/auditLog.js";
import * as User from "../models/user.js";
import { passwordResetMessage } from "../email/messages.js";
import { withTransaction } from "../db/transaction.js";
import { hashPassword } from "../utils/password.js";
import {
    createPasswordResetToken, readEmailActionClaims, verifyPasswordResetToken,
} from "../utils/emailActionToken.js";
import { normalizeEmail, parseId, validateNewEmail, validateResetPassword } from "../utils/validation.js";
import { isProduction } from "../utils/env.js";

const GENERIC_NOTICE = "If an account matches that email address and email sending is available, reset instructions will be sent shortly.";

function makeResetUrl(appBaseUrl, token, nodeEnv) {
    const base = new URL(appBaseUrl);

    if (!new Set(["http:", "https:"]).has(base.protocol) || base.username || base.password
        || base.search || base.hash || base.pathname !== "/" || (isProduction(nodeEnv) && base.protocol !== "https:")) {
        throw new Error("The app base URL is invalid for password reset links.");
    }

    return new URL(`/reset-password/${encodeURIComponent(token)}`, base).toString();
}

function renderResetForm(res, { errors = [], token = "", status = 200, invalid = false } = {}) {
    res.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer");
    res.status(status).render("reset-password", { title: "Reset Password", errors, token, invalid });
}

export function createPasswordResetController({ emailSender, appBaseUrl, tokenSecret, nodeEnv }) {
    async function loadUserForToken(db, token) {
        const claims = readEmailActionClaims(token);
        const userId = parseId(claims?.sub);

        if (!claims || !userId) {
            return null;
        }

        const user = await User.findById(db, userId);

        if (!user || !verifyPasswordResetToken(token, user, tokenSecret)) {
            return null;
        }

        return user;
    }

    return {
        showRequest(req, res) {
            res.set("Cache-Control", "no-store");
            res.render("forgot-password", { title: "Forgot Password", errors: [], notice: null, email: "" });
        },

        async request(req, res) {
            res.set("Cache-Control", "no-store");
            const { email, errors } = validateNewEmail(req.body);

            if (errors.length > 0) {
                return res.status(400).render("forgot-password", {
                    title: "Forgot Password", errors, notice: null, email,
                });
            }

            const normalized = normalizeEmail(email);
            const user = await User.findByEmail(req.app.locals.db, normalized);

            if (user?.password_hash && emailSender?.configured && appBaseUrl) {
                const token = createPasswordResetToken(user, tokenSecret);
                let url;

                try {
                    url = makeResetUrl(appBaseUrl, token, nodeEnv);
                } catch {
                    console.error("Password reset email could not be sent because the app URL is not configured correctly.");
                }

                if (url) {
                    const message = passwordResetMessage(url);
                    void emailSender.send({ to: user.email, ...message }).catch(() => {
                        console.error("Password reset email could not be sent through Resend.");
                    });
                }
            }

            res.render("forgot-password", {
                title: "Forgot Password", errors: [], notice: GENERIC_NOTICE, email: normalized,
            });
        },

        async showReset(req, res) {
            const user = await loadUserForToken(req.app.locals.db, req.params.token);

            if (!user) {
                return renderResetForm(res, { invalid: true, status: 400 });
            }

            renderResetForm(res, { token: req.params.token });
        },

        async reset(req, res) {
            const { password, errors } = validateResetPassword(req.body);

            if (errors.length > 0) {
                return renderResetForm(res, { errors, token: req.params.token, status: 400 });
            }

            const user = await loadUserForToken(req.app.locals.db, req.params.token);

            if (!user) {
                return renderResetForm(res, { invalid: true, status: 400 });
            }

            const passwordHash = await hashPassword(password);
            const changed = await withTransaction(req.app.locals.db, async (client) => {
                const locked = await User.findByIdForUpdate(client, user.id);

                if (!locked || !verifyPasswordResetToken(req.params.token, locked, tokenSecret)) {
                    return false;
                }

                await User.setPasswordHash(client, locked.id, passwordHash);
                await User.endOtherSessions(client, locked.id);
                await AuditLog.record(client, {
                    companyId: locked.companyId, actorId: locked.id, action: "password_changed", targetId: locked.id,
                });
                return true;
            });

            if (!changed) {
                return renderResetForm(res, { invalid: true, status: 400 });
            }

            res.redirect("/login?password-reset=1");
        },
    };
}
