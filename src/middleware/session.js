import session from "express-session";
import connectPgSimple from "connect-pg-simple";

const PgStore = connectPgSimple(session);

export function createSessionStore(pool) {
    return new PgStore({ pool });
}

export default function sessionMiddleware({ secret, store }) {
    return session({
        secret,
        store,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 1000 * 60 * 60 * 24 * 7,
        },
    });
}
