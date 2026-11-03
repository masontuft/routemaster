import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import { testDb } from "./test/db.js";
import { seedTestData } from "./db/seedTestData.js";

const db = testDb("seeddata");
const pool = db.pool;
const today = new Date("2026-11-03T12:00:00Z");

before(() => {
    return db.reset();
});
beforeEach(() => {
    return db.reset();
});
after(() => {
    return db.close();
});

async function count(sql) {
    const { rows } = await pool.query(sql);
    return Number(rows[0].count);
}

test("seeds customers, requests in every status, and one route for tomorrow", async () => {
    const result = await seedTestData(pool, { today });

    assert.deepStrictEqual(result, { seeded: true, customers: 8, route: "2026-11-04" });

    const { rows } = await pool.query(
        `SELECT request_statuses.name, count(*) FROM service_requests
         JOIN request_statuses ON request_statuses.id = service_requests.status_id
         GROUP BY request_statuses.name ORDER BY request_statuses.name`,
    );
    assert.deepStrictEqual(rows.map((row) => {
        return [row.name, Number(row.count)];
    }), [["Cancelled", 1], ["Completed", 1], ["Requested", 3], ["Scheduled", 3]]);

    assert.strictEqual(await count("SELECT count(*) FROM route_stops"), 3);
    assert.strictEqual(await count("SELECT count(*) FROM properties WHERE latitude IS NULL"), 0);
    assert.strictEqual(await count("SELECT count(*) FROM area_days"), 6);
});

test("a second run adds nothing", async () => {
    await seedTestData(pool, { today });
    const before = await count("SELECT count(*) FROM service_requests");

    assert.deepStrictEqual(await seedTestData(pool, { today }), { seeded: false });
    assert.strictEqual(await count("SELECT count(*) FROM service_requests"), before);
    assert.strictEqual(await count("SELECT count(*) FROM customers"), 8);
});
