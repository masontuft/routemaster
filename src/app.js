import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import routes from "./routes/index.js";
import authRoutes from "./routes/auth.js";
import sessionMiddleware, { createSessionStore } from "./middleware/session.js";
import csrf from "./middleware/csrf.js";
import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// pool: pg Pool for models and the session store. store: override the session store (tests only).
export default function createApp({ pool, sessionSecret, store } = {}) {
    if (!sessionSecret) {
        throw new Error("sessionSecret is required.");
    }

    const app = express();

    // Render terminates TLS in front of the app, so trust exactly one proxy hop.
    app.set("trust proxy", 1);
    app.set("view engine", "ejs");
    app.set("views", path.join(here, "views"));
    app.locals.db = pool;
    app.locals.sessionStore = store ?? (pool ? createSessionStore(pool) : undefined);

    app.use(express.static(path.join(here, "..", "public")));
    app.use(sessionMiddleware({ secret: sessionSecret, store: app.locals.sessionStore }));
    app.use(express.urlencoded({ extended: false }));
    app.use(csrf);
    app.use((req, res, next) => {
        res.locals.user = req.session.user;
        next();
    });
    app.use(routes);
    app.use(authRoutes);
    app.use(notFound);
    app.use(errorHandler);

    return app;
}
