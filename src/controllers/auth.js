import * as User from "../models/user.js";
import * as Company from "../models/company.js";
import { publicCompanyId, companyHomePath } from "../utils/company.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { validateRegistration, normalizeEmail } from "../utils/validation.js";
import { regenerateSession, destroySession } from "../utils/session.js";

// Compared against when the email is unknown, so a missing account takes about as long as a wrong password.
const DUMMY_HASH = await hashPassword("not-a-real-password");

export function showRegister(req, res) {
    res.render("register", { title: "Create Account", errors: [], email: "" });
}

export async function register(req, res) {
    const { email, password, errors } = validateRegistration(req.body);

    if (errors.length === 0) {
        const passwordHash = await hashPassword(password);
        // The bare /register is the first company's, and /w/<slug>/register is that company's (publicCompanyId).
        const user = await User.create(req.app.locals.db, {
            email, passwordHash, roleName: "customer", companyId: publicCompanyId(req),
        });

        if (user) {
            await regenerateSession(req);
            req.session.user = {
                id: user.id, email: user.email, role: user.role, displayName: user.email, companyId: user.companyId,
            };
            return res.redirect(companyHomePath(req.company));
        }

        errors.push("That email is already registered.");
    }

    res.status(400).render("register", { title: "Create Account", errors, email });
}

export function showLogin(req, res) {
    res.render("login", {
        title: "Log In", errors: [], email: "",
        notice: req.query["password-reset"] === "1" ? "Your password was reset. Sign in with the new password." : null,
    });
}

export async function login(req, res) {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password ?? "");
    const user = await User.findByEmail(req.app.locals.db, email);
    const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);

    if (!user || !user.password_hash || !valid) {
        return res.status(401).render("login", {
            title: "Log In",
            errors: ["Invalid email or password."],
            email,
            notice: null,
        });
    }

    await regenerateSession(req);
    req.session.user = {
        id: user.id, email: user.email, role: user.role, displayName: user.email, companyId: user.companyId,
    };
    // Back to the front page of the user's own company, not the bare site, which is the first company's.
    res.redirect(companyHomePath(await Company.findById(req.app.locals.db, user.companyId)));
}

export async function logout(req, res) {
    await destroySession(req);
    res.clearCookie("connect.sid");
    res.redirect("/");
}
