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
    assert.match(res.text, /<h1>Routemaster<\/h1>/);
});

test("GET /health returns 200", async () => {
    const res = await request(createApp({ sessionSecret: "test-secret" })).get("/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.text, "ok");
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
