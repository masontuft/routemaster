import pg from "pg";

export function createPool(connectionString, options = {}) {
    const pool = new pg.Pool({ connectionString, ...options });

    // An idle client can be dropped at any time. With no listener, Node treats the event as fatal and exits.
    pool.on("error", (error) => {
        console.error("Idle database client error:", error.message);
    });

    return pool;
}
