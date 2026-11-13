import pg from "pg";

// Without this, pg waits forever for a connection. A database that accepts the socket but never answers would hang
// `pnpm migrate`, so Render never sees an open port and reports "Timed Out" after 15 minutes. Failing in seconds
// makes the deploy stop with a readable error instead. Callers can override it through `options`.
export const CONNECTION_TIMEOUT_MS = 10_000;

export function createPool(connectionString, options = {}) {
    const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS, ...options });

    // An idle client can be dropped at any time. With no listener, Node treats the event as fatal and exits.
    pool.on("error", (error) => {
        console.error("Idle database client error:", error.message);
    });

    return pool;
}
