import { rateLimit } from "express-rate-limit";

// Per-IP limit. Over the limit, the request goes to the global error handler as a 429.
// The counts live in this process's memory, so they reset on restart and are per instance.
export default function createLimiter({ windowMs, max }) {
    return rateLimit({
        windowMs,
        limit: max,
        legacyHeaders: false,
        standardHeaders: "draft-7",
        handler: (req, res, next) => {
            const error = new Error("Too many requests");
            error.status = 429;
            next(error);
        },
    });
}
