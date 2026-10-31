import { csrfSync } from "csrf-sync";

// Forms send the token in a hidden _csrf field. Tokens live in the session (synchronizer token pattern).
const { csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) => {
        return req.body?._csrf;
    },
});

export default function csrf(req, res, next) {
    csrfSynchronisedProtection(req, res, (error) => {
        if (error) {
            return next(error);
        }

        res.locals.csrfToken = req.csrfToken();
        next();
    });
}
