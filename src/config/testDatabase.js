// Tests may only touch the database named by TEST_DATABASE_URL, never DATABASE_URL.
// Callers must connect with the URL returned here.
// TODO (Mason): decide whether localhost, 127.0.0.1, and other aliases are the same server.
// This check compares the URL host, port, and database name. It does not resolve DNS.

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const DEFAULT_POSTGRES_PORT = "5432";

function trimmedEnvValue(value) {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim();
}

function queryParam(parsed, name) {
    const target = name.toLowerCase();
    let found = null;
    for (const [key, value] of parsed.searchParams.entries()) {
        if (key.toLowerCase() === target) {
            found = value;
        }
    }
    return found;
}

function normalizeEndpoint(value) {
    let endpoint = value.trim().toLowerCase().replace(/\.$/, "");
    if (endpoint.startsWith("[") && endpoint.endsWith("]") && endpoint.length > 2) {
        endpoint = endpoint.slice(1, -1);
    }
    return endpoint;
}

function canonicalPort(rawPort) {
    if (rawPort === "") {
        return DEFAULT_POSTGRES_PORT;
    }
    if (!/^\d+$/.test(rawPort)) {
        return null;
    }
    const portNumber = Number(rawPort);
    if (portNumber < 1 || portNumber > 65535) {
        return null;
    }
    return String(portNumber);
}

function databaseNameFrom(parsed) {
    const fromQuery = queryParam(parsed, "dbname");
    if (fromQuery !== null && fromQuery.trim() !== "") {
        return fromQuery.trim().toLowerCase();
    }

    const pathName = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (pathName !== "") {
        try {
            return decodeURIComponent(pathName).trim().toLowerCase();
        } catch {
            return null;
        }
    }

    const userFromQuery = queryParam(parsed, "user");
    if (userFromQuery !== null && userFromQuery.trim() !== "") {
        return userFromQuery.trim().toLowerCase();
    }
    if (parsed.username !== "") {
        return parsed.username.toLowerCase();
    }
    return "";
}

function postgresTarget(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return null;
    }
    if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
        return null;
    }

    const hostaddr = queryParam(parsed, "hostaddr");
    const host = queryParam(parsed, "host");
    let endpoint = parsed.hostname;
    if (hostaddr !== null && hostaddr.trim() !== "") {
        endpoint = hostaddr;
    } else if (host !== null && host.trim() !== "") {
        endpoint = host;
    }
    endpoint = normalizeEndpoint(endpoint);
    if (/\s/.test(endpoint)) {
        return null;
    }

    const queryPort = queryParam(parsed, "port");
    const rawPort = queryPort !== null && queryPort.trim() !== "" ? queryPort.trim() : parsed.port;
    const port = canonicalPort(rawPort);
    if (port === null) {
        return null;
    }

    const databaseName = databaseNameFrom(parsed);
    if (databaseName === null) {
        return null;
    }

    return {
        endpoint,
        port,
        databaseName,
    };
}

function isSameDatabase(left, right) {
    if (left.endpoint !== right.endpoint) {
        return false;
    }
    if (left.port !== right.port) {
        return false;
    }
    if (left.databaseName !== right.databaseName) {
        return false;
    }
    return true;
}

export function getTestDatabaseUrl(env = process.env) {
    const testUrl = trimmedEnvValue(env.TEST_DATABASE_URL);
    if (testUrl === "") {
        throw new Error("TEST_DATABASE_URL is not set. Refusing to run database tests.");
    }

    const testTarget = postgresTarget(testUrl);
    if (testTarget === null) {
        throw new Error("TEST_DATABASE_URL is not a Postgres connection URL. Refusing to run database tests.");
    }

    const databaseUrl = trimmedEnvValue(env.DATABASE_URL);
    if (databaseUrl === "") {
        return testUrl;
    }

    const databaseTarget = postgresTarget(databaseUrl);
    if (databaseTarget === null) {
        throw new Error("DATABASE_URL is not a Postgres connection URL. Refusing to run database tests.");
    }

    if (isSameDatabase(testTarget, databaseTarget)) {
        throw new Error("TEST_DATABASE_URL equals DATABASE_URL. Refusing to run database tests.");
    }

    return testUrl;
}
