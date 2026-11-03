import { test } from "node:test";
import assert from "node:assert";
import { createGeocoder, addressText, isValidPoint } from "./geocoder.js";

// A fetch that answers from a list of canned JSON bodies and records the URLs it was asked for.
function fakeFetch(...answers) {
    const calls = [];
    const fetchFn = async (url) => {
        calls.push(url);
        const next = answers.shift();

        if (next instanceof Error) {
            throw next;
        }

        return { ok: next.ok ?? true, status: next.status ?? 200, json: async () => {
            return next.body;
        } };
    };
    return { fetchFn, calls };
}

const googleHit = (type = "ROOFTOP") => {
    return { body: { status: "OK", results: [{ geometry: { location: { lat: 43.8, lng: -111.8 }, location_type: type } }] } };
};
const osmHit = { body: [{ lat: "43.81", lon: "-111.79" }] };
const noSleep = async () => {};

test("with a key, Google answers first and Nominatim is not asked", async () => {
    const { fetchFn, calls } = fakeFetch(googleHit());
    const geocode = createGeocoder({ apiKey: "KEY", fetchFn, sleep: noSleep });

    assert.deepStrictEqual(await geocode("1 Elm St, Rexburg"), { status: "found", lat: 43.8, lng: -111.8, source: "google" });
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0], /googleapis/);
});

test("an approximate Google point is not trusted, so Nominatim is tried", async () => {
    const { fetchFn } = fakeFetch(googleHit("APPROXIMATE"), osmHit);
    const geocode = createGeocoder({ apiKey: "KEY", fetchFn, sleep: noSleep });

    const answer = await geocode("1 Elm St, Rexburg");

    assert.strictEqual(answer.source, "nominatim");
    assert.strictEqual(answer.lat, 43.81);
});

test("without a key only Nominatim is asked", async () => {
    const { fetchFn, calls } = fakeFetch(osmHit);
    const geocode = createGeocoder({ fetchFn, sleep: noSleep });

    assert.strictEqual((await geocode("1 Elm St, Rexburg")).status, "found");
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0], /nominatim/);
});

test("both services finding nothing is none, not an error", async () => {
    const { fetchFn } = fakeFetch({ body: { status: "ZERO_RESULTS", results: [] } }, { body: [] });
    const geocode = createGeocoder({ apiKey: "KEY", fetchFn, sleep: noSleep });

    assert.deepStrictEqual(await geocode("nowhere"), { status: "none" });
});

test("a refused or unreachable service is an error, even when the other finds nothing", async () => {
    const quota = fakeFetch({ body: { status: "OVER_QUERY_LIMIT" } }, { body: [] });
    const refused = await createGeocoder({ apiKey: "KEY", fetchFn: quota.fetchFn, sleep: noSleep })("a");
    const down = fakeFetch(new Error("getaddrinfo ENOTFOUND"));
    const unreachable = await createGeocoder({ fetchFn: down.fetchFn, sleep: noSleep })("a");
    const http = fakeFetch({ ok: false, status: 503, body: {} });
    const unavailable = await createGeocoder({ fetchFn: http.fetchFn, sleep: noSleep })("a");

    assert.strictEqual(refused.status, "error");
    assert.strictEqual(unreachable.status, "error");
    assert.strictEqual(unavailable.status, "error");
});

test("an error never carries the key or the request URL", async () => {
    const { fetchFn } = fakeFetch(new Error("fetch failed https://maps.googleapis.com/?key=SECRETKEY"), new Error("x"));
    const answer = await createGeocoder({ apiKey: "SECRETKEY", fetchFn, sleep: noSleep })("1 Elm St");

    assert.strictEqual(answer.status, "error");
    assert.doesNotMatch(JSON.stringify(answer), /SECRETKEY|googleapis/);
});

test("Nominatim calls are spaced at least a second apart", async () => {
    let clock = 10_000;
    const slept = [];
    const { fetchFn } = fakeFetch(osmHit, osmHit, osmHit);
    const geocode = createGeocoder({
        fetchFn, now: () => {
            return clock;
        }, sleep: async (ms) => {
            slept.push(ms);
            clock += ms;
        },
    });

    await geocode("a");
    clock += 200;
    await geocode("b");
    clock += 5000;
    await geocode("c");

    assert.strictEqual(slept.length, 1);
    assert.ok(slept[0] >= 800 && slept[0] <= 1100);
});

test("points outside the globe are rejected", async () => {
    const { fetchFn } = fakeFetch({ body: [{ lat: "143.8", lon: "-111.8" }] });

    assert.deepStrictEqual(await createGeocoder({ fetchFn, sleep: noSleep })("a"), { status: "none" });
    assert.strictEqual(isValidPoint(NaN, 1), false);
    assert.strictEqual(isValidPoint(45, 181), false);
    assert.strictEqual(isValidPoint(45, -111), true);
});

test("address text joins what is present and refuses an address too vague to look up", () => {
    assert.strictEqual(addressText({ street: "1 Elm St", city: "Rexburg", zip: "83440" }, "ID"), "1 Elm St, Rexburg, ID 83440");
    assert.strictEqual(addressText({ street: "1 Elm St", city: "Rexburg", zip: null }), "1 Elm St, Rexburg");
    assert.strictEqual(addressText({ street: "1 Elm St", city: null, zip: "83440" }), "1 Elm St, 83440");
    assert.strictEqual(addressText({ street: "1 Elm St", city: null, zip: null }), null);
});
