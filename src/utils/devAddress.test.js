import { test } from "node:test";
import assert from "node:assert";
import { lanAddress, expoGoLink, qrSvg } from "./devAddress.js";

test("lanAddress takes the first non-internal IPv4 address", () => {
    const interfaces = {
        lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
        en0: [
            { family: "IPv6", address: "fe80::1", internal: false },
            { family: "IPv4", address: "10.0.0.5", internal: false },
        ],
    };

    assert.strictEqual(lanAddress(interfaces), "10.0.0.5");
});

test("lanAddress falls back to localhost with no network", () => {
    assert.strictEqual(lanAddress({}), "localhost");
    assert.strictEqual(lanAddress({ lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true }] }), "localhost");
});

test("expoGoLink builds the Expo Go form of the batch link", () => {
    assert.strictEqual(expoGoLink("TOKEN", { host: "10.0.0.5", port: "8082" }), "exp://10.0.0.5:8082/--/batch/TOKEN");
});

test("qrSvg draws a sized, labelled SVG with no external references", async () => {
    const svg = await qrSvg("exp://10.0.0.5:8081/--/batch/TOKEN", "Expo Go link");

    assert.match(svg, /^<svg width="220" height="220" role="img" aria-label="Expo Go link" /);
    assert.ok(svg.includes("</svg>"));
    assert.ok(!/href=|src=|url\(|<image|<script/.test(svg), "nothing in the picture is fetched or run");
});

test("qrSvg gives a different picture for a different link", async () => {
    assert.notStrictEqual(await qrSvg("exp://a"), await qrSvg("exp://b"));
});
