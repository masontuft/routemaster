import { test } from "node:test";
import assert from "node:assert";
import { qrSvg } from "./qr.js";

test("qrSvg draws a sized, labelled SVG with no external references", () => {
    const svg = qrSvg("exp://10.0.0.5:8081/--/batch/TOKEN", "Expo Go link");

    assert.match(svg, /^<svg width="220" height="220" role="img" aria-label="Expo Go link" /);
    assert.ok(svg.includes("</svg>"));
    assert.ok(!/href=|src=|url\(|<image|<script/.test(svg), "nothing in the picture is fetched or run");
});

test("qrSvg gives a different picture for a different link", () => {
    assert.notStrictEqual(qrSvg("exp://a"), qrSvg("exp://b"));
});

test("qrSvg holds a full deep link", () => {
    assert.ok(qrSvg(`sprinklermessenger://batch/${"A".repeat(43)}`).includes("<svg"));
});
