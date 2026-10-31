import createApp from "./app.js";
import { createPool } from "./db/pool.js";

const port = Number(process.env.PORT) || 3000;

if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
    console.error("DATABASE_URL and SESSION_SECRET must be set.");
    process.exit(1);
}

const app = createApp({
    pool: createPool(process.env.DATABASE_URL),
    sessionSecret: process.env.SESSION_SECRET,
});

// Bind all interfaces: Render's proxy reaches the container over the network, not loopback.
app.listen(port, "0.0.0.0", () => {
    console.log(`Routemaster listening on port ${port}`);
});
