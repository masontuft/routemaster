import pg from "pg";

// How long a pool created by `createStartupPool` waits for a connection before giving up.
export const CONNECTION_TIMEOUT_MS = 10_000;

export function createPool(connectionString, options = {}) {
    const pool = new pg.Pool({ connectionString, ...options });

    // An idle client can be dropped at any time. With no listener, Node treats the event as fatal and exits.
    pool.on("error", (error) => {
        console.error("Idle database client error:", error.message);
    });

    return pool;
}

// For a one-off process that runs before the app serves, such as `pnpm migrate`. By default pg waits forever for a
// connection, so a database that accepts the socket but never answers would hang the process. Render would then see
// no open port and report "Timed Out" after 15 minutes. Failing in seconds stops the deploy with a readable error.
// The app's own pool does not use this, so a request waiting for a free client is not cut off.
export function createStartupPool(connectionString, options = {}) {
    return createPool(connectionString, { connectionTimeoutMillis: CONNECTION_TIMEOUT_MS, ...options });
}
