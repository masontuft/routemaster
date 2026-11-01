import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert";
import request from "supertest";
import express from "express";
import createApp from "./app.js";
import errorHandler from "./middleware/errorHandler.js";

test("GET / renders the home page", async () => {
    const res = await request(createApp({ sessionSecret: "test-secret" })).get("/");
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /<h1 id="hero-title">Schedule Your Service<\/h1>/);
});

test("GET /health returns 200", async () => {
    const res = await request(createApp({ sessionSecret: "test-secret" })).get("/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.text, "ok");
});

test("pages include the reload script when devReload is on", async () => {
    const res = await request(createApp({ sessionSecret: "test-secret", devReload: true })).get("/");
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /id="dev-reload"/);
    assert.match(res.text, /\/__dev\/boot/);
});

test("pages omit the reload script when devReload is off", async () => {
    const res = await request(createApp({ sessionSecret: "test-secret", devReload: false })).get("/");
    assert.strictEqual(res.status, 200);
    assert.doesNotMatch(res.text, /id="dev-reload"/);
});

test("GET /__dev/boot returns the boot id when devReload is on", async () => {
    const res = await request(createApp({
        sessionSecret: "test-secret",
        devReload: true,
        devReloadBootId: "boot-1",
    })).get("/__dev/boot");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.text, "boot-1");
});

test("GET /__dev/boot is 404 when devReload is off", async () => {
    const res = await request(createApp({ sessionSecret: "test-secret", devReload: false })).get("/__dev/boot");
    assert.strictEqual(res.status, 404);
});

test("pages omit the reload script when NODE_ENV is a production-like value", async () => {
    const original = process.env.NODE_ENV;
    const hadKey = Object.hasOwn(process.env, "NODE_ENV");
    try {
        for (const value of ["production", "Production", "PRODUCTION", " production "]) {
            process.env.NODE_ENV = value;
            const res = await request(createApp({ sessionSecret: "test-secret" })).get("/");
            assert.strictEqual(res.status, 200, value);
            assert.doesNotMatch(res.text, /id="dev-reload"/, value);
        }
    } finally {
        if (hadKey) {
            process.env.NODE_ENV = original;
        } else {
            delete process.env.NODE_ENV;
        }
    }
});

test("pages include the reload script when NODE_ENV is not production", async () => {
    const original = process.env.NODE_ENV;
    const hadKey = Object.hasOwn(process.env, "NODE_ENV");
    try {
        process.env.NODE_ENV = "development";
        const res = await request(createApp({ sessionSecret: "test-secret" })).get("/");
        assert.strictEqual(res.status, 200);
        assert.match(res.text, /id="dev-reload"/);
    } finally {
        if (hadKey) {
            process.env.NODE_ENV = original;
        } else {
            delete process.env.NODE_ENV;
        }
    }
});

test("an unknown URL renders the 404 page", async () => {
    const res = await request(createApp({ sessionSecret: "test-secret" })).get("/no-such-page");
    assert.strictEqual(res.status, 404);
    assert.match(res.text, /Page Not Found/);
});

test("a thrown error renders the generic page without leaking details", async () => {
    const app = express();
    app.set("view engine", "ejs");
    app.set("views", path.join(path.dirname(fileURLToPath(import.meta.url)), "views"));
    app.get("/boom", async () => {
        throw new Error("secret database detail");
    });
    app.use(errorHandler);

    const original = console.error;
    console.error = () => {};
    const res = await request(app).get("/boom");
    console.error = original;

    assert.strictEqual(res.status, 500);
    assert.match(res.text, /Something Went Wrong/);
    assert.doesNotMatch(res.text, /secret database detail/);
});
