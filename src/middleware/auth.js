import { forbidden } from "../utils/errors.js";

export function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    next();
}

export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        if (!roles.includes(req.session.user.role)) {
            return next(forbidden());
        }

        next();
    };
}
