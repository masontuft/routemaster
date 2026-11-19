import * as User from "../models/user.js";
import { DEFAULT_COMPANY_ID } from "../config/company.js";
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
        // There is no company in the address of /register yet, so a self-registered customer joins the first company.
        const user = await User.create(req.app.locals.db, {
            email, passwordHash, roleName: "customer", companyId: DEFAULT_COMPANY_ID,
        });

        if (user) {
            await regenerateSession(req);
            req.session.user = {
                id: user.id, email: user.email, role: user.role, displayName: user.email, companyId: user.companyId,
            };
            return res.redirect("/");
        }

        errors.push("That email is already registered.");
    }

    res.status(400).render("register", { title: "Create Account", errors, email });
}

export function showLogin(req, res) {
    res.render("login", { title: "Log In", errors: [], email: "" });
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
        });
    }

    await regenerateSession(req);
    req.session.user = {
        id: user.id, email: user.email, role: user.role, displayName: user.email, companyId: user.companyId,
    };
    res.redirect("/");
}

export async function logout(req, res) {
    await destroySession(req);
    res.clearCookie("connect.sid");
    res.redirect("/");
}
