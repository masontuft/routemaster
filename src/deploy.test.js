import net from "node:net";
import { test, mock } from "node:test";
import assert from "node:assert";
import request from "supertest";
import session from "express-session";
import createApp from "./app.js";
import { createPool, createStartupPool, CONNECTION_TIMEOUT_MS } from "./db/pool.js";
import { missingEnvVariables, sessionSecretProblem } from "./utils/env.js";

function silence() {}

async function answers() {
    return { rows: [{}] };
}

async function rejects() {
    throw new Error("connection refused");
}

function appWithPool(query) {
    return createApp({ pool: { query }, store: new session.MemoryStore(), sessionSecret: "test-secret" });
}

test("health is 200 when the database answers and 503 when it does not", async () => {
    const quiet = mock.method(console, "error", silence);
    try {
        const up = await request(appWithPool(answers)).get("/health");
        assert.strictEqual(up.status, 200);
        assert.strictEqual(up.text, "ok");

        const down = await request(appWithPool(rejects)).get("/health");
        assert.strictEqual(down.status, 503);
        assert.doesNotMatch(down.text, /refused/);
    } finally {
        quiet.mock.restore();
    }
});

test("an idle pool error is logged and does not throw", async () => {
    const logged = mock.method(console, "error", silence);
    const pool = createPool("postgres://user:password@localhost:5432/none");
    try {
        assert.doesNotThrow(() => {
            pool.emit("error", new Error("terminated"));
        });
        assert.strictEqual(logged.mock.callCount(), 1);
    } finally {
        logged.mock.restore();
        await pool.end();
    }
});

test("only the startup pool gives up on a connection, after 10 seconds unless the caller says otherwise", async () => {
    const url = "postgres://user:password@localhost:5432/none";
    const app = createPool(url);
    const startup = createStartupPool(url);
    const custom = createStartupPool(url, { connectionTimeoutMillis: 250 });
    try {
        assert.strictEqual(CONNECTION_TIMEOUT_MS, 10_000);
        assert.strictEqual(app.options.connectionTimeoutMillis, undefined);
        assert.strictEqual(startup.options.connectionTimeoutMillis, CONNECTION_TIMEOUT_MS);
        assert.strictEqual(custom.options.connectionTimeoutMillis, 250);
    } finally {
        await app.end();
        await startup.end();
        await custom.end();
    }
});

test("a database that accepts the socket but never answers makes a startup query fail, not hang", async () => {
    const sockets = new Set();
    const silent = net.createServer((socket) => {
        sockets.add(socket);
    });
    await new Promise((resolve) => {
        silent.listen(0, "127.0.0.1", resolve);
    });
    const pool = createStartupPool(`postgres://user:password@127.0.0.1:${silent.address().port}/none`, {
        connectionTimeoutMillis: 250,
    });
    try {
        await assert.rejects(pool.query("SELECT 1"), /timeout/i);
    } finally {
        await pool.end();
        sockets.forEach((socket) => {
            socket.destroy();
        });
        await new Promise((resolve) => {
            silent.close(resolve);
        });
    }
});

test("the session secret check only bites in production", () => {
    assert.strictEqual(sessionSecretProblem("change-me", "development"), null);
    assert.match(sessionSecretProblem("change-me", "production"), /SESSION_SECRET/);
    assert.match(sessionSecretProblem("short", "production"), /at least 32/);
    assert.match(sessionSecretProblem(undefined, " Production "), /SESSION_SECRET/);
    assert.strictEqual(sessionSecretProblem("x".repeat(32), "production"), null);
});

test("responses carry security headers and the dev script carries the matching nonce", async () => {
    const app = createApp({ sessionSecret: "test-secret", devReload: true });
    const res = await request(app).get("/");
    const csp = res.headers["content-security-policy"];

    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.doesNotMatch(csp, /unsafe-inline/);
    assert.strictEqual(res.headers["x-content-type-options"], "nosniff");
    assert.strictEqual(res.headers["x-powered-by"], undefined);
    assert.strictEqual(res.headers["strict-transport-security"], undefined);

    const nonce = csp.match(/'nonce-([^']+)'/)[1];
    assert.match(res.text, new RegExp(`<script id="dev-reload" nonce="${nonce.replace(/[+/=]/g, "\\$&")}">`));

    const other = await request(app).get("/");
    assert.notStrictEqual(other.headers["content-security-policy"], csp);
});

test("HSTS is sent only in production", async () => {
    const original = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = "production";
        const res = await request(createApp({ sessionSecret: "test-secret" })).get("/");
        assert.match(res.headers["strict-transport-security"], /max-age=\d+/);
        assert.doesNotMatch(res.text, /id="dev-reload"/);
    } finally {
        if (original === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = original;
        }
    }
});

test("missingEnvVariables names each required variable that is unset or blank", () => {
    assert.deepStrictEqual(missingEnvVariables({}), ["DATABASE_URL", "SESSION_SECRET"]);
    assert.deepStrictEqual(missingEnvVariables({ DATABASE_URL: "postgres://x", SESSION_SECRET: "  " }), ["SESSION_SECRET"]);
    assert.deepStrictEqual(missingEnvVariables({ DATABASE_URL: "postgres://x", SESSION_SECRET: "s" }), []);
});
