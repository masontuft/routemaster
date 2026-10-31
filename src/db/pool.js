import pg from "pg";

export function createPool(connectionString, options = {}) {
    return new pg.Pool({ connectionString, ...options });
}
