import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "../test/db.js";
import * as Customer from "../models/customer.js";
import * as Property from "../models/property.js";
import { locateProperties } from "./locate.js";

const db = testDb("locate");
const pool = db.pool;
let customerId;

before(() => {
    return db.reset();
});
beforeEach(async () => {
    await db.reset();
    customerId = await Customer.create(pool, { name: "Ann Lee", phone: "208-555-0101" });
});
after(() => {
    return db.close();
});

async function property(street, city = "Rexburg", zip = null) {
    return Property.create(pool, customerId, { street, city, zip });
}

async function stateOf(id) {
    const { rows } = await pool.query(
        "SELECT latitude, longitude, geocode_status FROM properties WHERE id = $1",
        [id],
    );
    return rows[0];
}

const found = async () => {
    return { status: "found", lat: 43.8, lng: -111.8, source: "google" };
};

test("a found point is saved and the property is ok", async () => {
    const id = await property("1 Elm St");

    const result = await locateProperties(pool, [id], { geocode: found });

    assert.deepStrictEqual(result, { found: 1, failed: 0, errored: false, left: 0 });
    assert.deepStrictEqual(await stateOf(id), { latitude: 43.8, longitude: -111.8, geocode_status: "ok" });
});

test("no result marks the property failed, and a later run does not ask again", async () => {
    const id = await property("1 Elm St");
    let asked = 0;
    const none = async () => {
        asked += 1;
        return { status: "none" };
    };

    await locateProperties(pool, [id], { geocode: none });
    await locateProperties(pool, [id], { geocode: none });

    assert.strictEqual((await stateOf(id)).geocode_status, "failed");
    assert.strictEqual(asked, 1);
});

test("a service error leaves the property pending and stops the run", async () => {
    const first = await property("1 Elm St");
    const second = await property("2 Elm St");
    let asked = 0;
    const broken = async () => {
        asked += 1;
        return { status: "error", reason: "google OVER_QUERY_LIMIT" };
    };

    const result = await locateProperties(pool, [first, second], { geocode: broken });

    assert.strictEqual(result.errored, true);
    assert.strictEqual(result.left, 2);
    assert.strictEqual(asked, 1);
    assert.strictEqual((await stateOf(first)).geocode_status, "pending");
});

test("the limit caps one run and reports what is left", async () => {
    const ids = [await property("1 Elm St"), await property("2 Elm St"), await property("3 Elm St")];

    const result = await locateProperties(pool, ids, { geocode: found, limit: 2 });

    assert.strictEqual(result.found, 2);
    assert.strictEqual(result.left, 1);
});

test("an address with no city and no ZIP is failed without asking a service", async () => {
    const id = await property("1 Elm St", null, null);
    let asked = 0;

    await locateProperties(pool, [id], { geocode: async () => {
        asked += 1;
        return { status: "found", lat: 1, lng: 1, source: "google" };
    } });

    assert.strictEqual(asked, 0);
    assert.strictEqual((await stateOf(id)).geocode_status, "failed");
});

test("the state is added to the text that is looked up", async () => {
    const id = await property("1 Elm St", "Rexburg", "83440");
    let text = "";

    await locateProperties(pool, [id], { state: "ID", geocode: async (address) => {
        text = address;
        return { status: "none" };
    } });

    assert.strictEqual(text, "1 Elm St, Rexburg, ID 83440");
});

test("changing the address clears the point, and saving the same address keeps it", async () => {
    const id = await property("1 Elm St", "Rexburg", "83440");
    await locateProperties(pool, [id], { geocode: found });

    await Property.update(pool, id, { street: "1 Elm St", city: "Rexburg", zip: "83440", notes: "gate code" });
    assert.strictEqual((await stateOf(id)).geocode_status, "ok");

    await Property.update(pool, id, { notes: "only a note" });
    assert.strictEqual((await stateOf(id)).geocode_status, "ok");

    await Property.update(pool, id, { street: "9 Oak Ave", city: "Rexburg", zip: "83440" });
    assert.deepStrictEqual(await stateOf(id), { latitude: null, longitude: null, geocode_status: "pending" });
});

test("retrying puts only failed properties back to pending", async () => {
    const bad = await property("1 Elm St");
    const good = await property("2 Elm St");
    await Property.markLocationFailed(pool, bad);
    await Property.saveLocation(pool, good, { lat: 43.8, lng: -111.8 });

    const changed = await Property.retryFailedLocations(pool, [bad, good]);

    assert.strictEqual(changed, 1);
    assert.strictEqual((await stateOf(bad)).geocode_status, "pending");
    assert.strictEqual((await stateOf(good)).geocode_status, "ok");
});

test("the database refuses a point without the ok status and a point off the globe", async () => {
    const id = await property("1 Elm St");

    await assert.rejects(pool.query("UPDATE properties SET latitude = 1, longitude = 1 WHERE id = $1", [id]));
    await assert.rejects(Property.saveLocation(pool, id, { lat: 95, lng: 0 }));
});
