import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import routes from "./routes/index.js";
import authRoutes from "./routes/auth.js";
import requestRoutes from "./routes/requests.js";
import staffRoutes from "./routes/staff.js";
import adminRoutes from "./routes/admin.js";
import reviewRoutes from "./routes/reviews.js";
import contactRoutes from "./routes/contact.js";
import linkRoutes from "./routes/link.js";
import scheduleRoutes from "./routes/schedule.js";
import rateLimit from "./middleware/rateLimit.js";
import sessionMiddleware, { createSessionStore } from "./middleware/session.js";
import { formatCents } from "./utils/money.js";
import csrf from "./middleware/csrf.js";
import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";
import { isProduction } from "./utils/env.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// pool: pg Pool for models and the session store. store: override the session store (tests only).
export default function createApp({
    pool,
    sessionSecret,
    store,
    rateLimitMax = 20,
    devReload,
    devReloadBootId,
} = {}) {
    if (!sessionSecret) {
        throw new Error("sessionSecret is required.");
    }

    const app = express();

    // Render terminates TLS in front of the app, so trust exactly one proxy hop.
    app.set("trust proxy", 1);
    app.set("view engine", "ejs");
    app.locals.formatCents = formatCents;
    app.set("views", path.join(here, "views"));
    app.locals.db = pool;
    app.locals.sessionStore = store ?? (pool ? createSessionStore(pool) : undefined);
    app.locals.devReload = devReload ?? !isProduction();
    app.locals.devReloadBootId = devReloadBootId ?? Date.now().toString();

    app.use(express.static(path.join(here, "..", "public")));
    app.use(sessionMiddleware({ secret: sessionSecret, store: app.locals.sessionStore }));
    app.use(express.urlencoded({ extended: false }));
    app.use(csrf);
    app.use((req, res, next) => {
        res.locals.user = req.session.user;
        next();
    });
    app.use(routes);
    const limit = rateLimit({ windowMs: 15 * 60 * 1000, max: rateLimitMax });
    app.use(authRoutes(limit));
    app.use(requestRoutes);
    app.use(staffRoutes);
    app.use(adminRoutes);
    app.use(reviewRoutes);
    app.use(linkRoutes(limit));
    app.use(scheduleRoutes(limit));
    app.use(contactRoutes(limit));
    app.use(notFound);
    app.use(errorHandler);

    return app;
}
