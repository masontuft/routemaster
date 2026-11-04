import express, { Router } from "express";
import { fetchBatch, postResults } from "../controllers/messengerApi.js";

// The only JSON routes (ADR 0015). They sit before the session and CSRF middleware in app.js because the app calling
// them has no cookie: the batch token in the path is the credential. Every answer is private and uncacheable, and
// errors are JSON with no detail, so nothing in a response says why a token failed.
export default function messengerApiRoutes(limit) {
    const router = Router();

    router.use("/api/messenger", (req, res, next) => {
        res.set("Cache-Control", "no-store");
        next();
    });
    router.use("/api/messenger", limit, express.json({ limit: "100kb" }));
    router.get("/api/messenger/batches/:token", fetchBatch);
    router.post("/api/messenger/batches/:token/results", postResults);
    router.use("/api/messenger", (req, res) => {
        res.status(404).json({ error: "not_found" });
    });
    router.use("/api/messenger", (error, req, res, next) => {
        if (res.headersSent) {
            return next(error);
        }

        const status = [400, 413, 429].includes(error.status) ? error.status : 500;

        if (status === 500) {
            console.error(error);
        }

        res.status(status).json({ error: status === 429 ? "rate_limited" : status === 500 ? "server_error" : "bad_request" });
    });

    return router;
}
