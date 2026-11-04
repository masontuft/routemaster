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
import importRoutes from "./routes/import.js";
import linkBatchRoutes from "./routes/linkBatches.js";
import routePlanRoutes from "./routes/routePlans.js";
import rebookingRoutes from "./routes/rebooking.js";
import messengerApiRoutes from "./routes/messengerApi.js";
import messengerBatchRoutes from "./routes/messengerBatches.js";
import linkRoutes from "./routes/link.js";
import scheduleRoutes from "./routes/schedule.js";
import rateLimit from "./middleware/rateLimit.js";
import sessionMiddleware, { createSessionStore } from "./middleware/session.js";
import { formatCents } from "./utils/money.js";
import { formatAddress } from "./utils/address.js";
import securityHeaders from "./middleware/securityHeaders.js";
import csrf from "./middleware/csrf.js";
import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";
import { isProduction } from "./utils/env.js";
import { fetchPublicGoogleSheet } from "./import/googleSheet.js";
import { createGeocoder } from "./geocoding/geocoder.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// pool: pg Pool for models and the session store. store: override the session store (tests only).
export default function createApp({
    pool,
    sessionSecret,
    store,
    rateLimitMax = 20,
    apiRateLimitMax = 120,
    fetchSheet = fetchPublicGoogleSheet,
    geocode = createGeocoder(),
    serviceState = "",
    routeStartAddress = "",
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
    app.locals.formatAddress = formatAddress;
    app.set("views", path.join(here, "views"));
    app.locals.db = pool;
    app.locals.sessionStore = store ?? (pool ? createSessionStore(pool) : undefined);
    app.locals.fetchSheet = fetchSheet;
    app.locals.geocode = geocode;
    app.locals.serviceState = serviceState;
    app.locals.routeStart = routeStartAddress;
    app.locals.devReload = devReload ?? !isProduction();
    app.locals.devReloadBootId = devReloadBootId ?? Date.now().toString();

    app.disable("x-powered-by");
    app.use(securityHeaders);
    app.use(express.static(path.join(here, "..", "public")));
    // The Messenger API has no cookie or CSRF token, so it comes before both. It has its own, larger limit: one batch
    // is a fetch and a few result uploads, and a retry loop on a bad signal should not lock the dispatcher out.
    app.use(messengerApiRoutes(rateLimit({ windowMs: 15 * 60 * 1000, max: apiRateLimitMax })));
    app.use(sessionMiddleware({ secret: sessionSecret, store: app.locals.sessionStore }));
    // Ticking every customer on the rebooking page sends one field per customer, so the default limit of 1000 fields
    // is raised. The 100 kb body limit still bounds the size.
    app.use(express.urlencoded({ extended: false, parameterLimit: 5000 }));
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
    app.use(importRoutes(limit));
    app.use(linkBatchRoutes(limit));
    app.use(messengerBatchRoutes(limit));
    app.use(routePlanRoutes(limit));
    app.use(rebookingRoutes(limit));
    app.use(reviewRoutes);
    app.use(linkRoutes(limit));
    app.use(scheduleRoutes(limit));
    app.use(contactRoutes(limit));
    app.use(notFound);
    app.use(errorHandler);

    return app;
}
