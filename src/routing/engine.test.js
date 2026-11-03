import { test } from "node:test";
import assert from "node:assert";
import {
    haversineMiles, pathMiles, nearestNeighborOrder, improveByReversing, orderStops,
    parseClock, formatClock, buildSchedule, buildRoute, mapsLinks,
} from "./engine.js";

const origin = { lat: 43.5, lng: -116.5 };

// A small repeatable random number generator, so a failing case can be run again.
function seeded(seed) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

function randomStops(count, seed) {
    const next = seeded(seed);
    return Array.from({ length: count }, (unused, index) => {
        return { id: index + 1, lat: 43.4 + next() * 0.2, lng: -116.7 + next() * 0.3 };
    });
}

function permutations(items) {
    if (items.length <= 1) {
        return [items];
    }

    return items.flatMap((item, index) => {
        const rest = [...items.slice(0, index), ...items.slice(index + 1)];
        return permutations(rest).map((tail) => {
            return [item, ...tail];
        });
    });
}

test("distance: a degree of latitude is about 69 miles, the same point is 0, and it is symmetric", () => {
    const north = { lat: origin.lat + 1, lng: origin.lng };

    assert.ok(Math.abs(haversineMiles(origin, north) - 69.09) < 0.1);
    assert.strictEqual(haversineMiles(origin, origin), 0);
    assert.strictEqual(haversineMiles(origin, north), haversineMiles(north, origin));
});

test("no stops gives an empty route, and one stop gives that stop", () => {
    assert.deepStrictEqual(orderStops(origin, []), []);
    assert.deepStrictEqual(orderStops(origin, [{ id: 1, lat: 43.6, lng: -116.4 }]).map((stop) => {
        return stop.id;
    }), [1]);
});

test("nearest neighbor visits the closest stop first, and a tie goes to the one listed first", () => {
    const near = { id: 1, lat: 43.51, lng: -116.5 };
    const far = { id: 2, lat: 43.9, lng: -116.5 };

    assert.deepStrictEqual(nearestNeighborOrder(origin, [far, near]).map((stop) => {
        return stop.id;
    }), [1, 2]);

    const left = { id: 3, lat: 43.5, lng: -116.51 };
    const right = { id: 4, lat: 43.5, lng: -116.49 };
    assert.strictEqual(nearestNeighborOrder(origin, [left, right])[0].id, 3);
    assert.strictEqual(nearestNeighborOrder(origin, [right, left])[0].id, 4);
});

test("reversing a stretch removes a crossing: a bow-tie order becomes the straight one", () => {
    const stops = [
        { id: 1, lat: 43.5, lng: -116.4 },
        { id: 2, lat: 43.6, lng: -116.3 },
        { id: 3, lat: 43.6, lng: -116.4 },
        { id: 4, lat: 43.5, lng: -116.3 },
    ];
    const crossed = [stops[0], stops[1], stops[2], stops[3]];

    const fixed = improveByReversing(origin, crossed);

    assert.ok(pathMiles(origin, fixed) < pathMiles(origin, crossed));
});

test("every route visits each stop exactly once and is never longer than nearest neighbor alone", () => {
    let betterCount = 0;

    for (let seed = 1; seed <= 150; seed += 1) {
        const stops = randomStops(5 + (seed % 20), seed);
        const greedy = nearestNeighborOrder(origin, stops);
        const improved = orderStops(origin, stops);

        assert.deepStrictEqual(improved.map((stop) => {
            return stop.id;
        }).sort((a, b) => {
            return a - b;
        }), stops.map((stop) => {
            return stop.id;
        }));
        assert.ok(pathMiles(origin, improved) <= pathMiles(origin, greedy) + 1e-9, `seed ${seed}`);

        if (pathMiles(origin, improved) < pathMiles(origin, greedy) - 1e-9) {
            betterCount += 1;
        }
    }

    assert.ok(betterCount > 0, "the improvement step should help on at least some days");
});

test("on small days the route is close to the best possible order", () => {
    let worst = 1;

    for (let seed = 1; seed <= 40; seed += 1) {
        const stops = randomStops(7, seed * 7);
        const best = Math.min(...permutations(stops).map((order) => {
            return pathMiles(origin, order);
        }));
        const ours = pathMiles(origin, orderStops(origin, stops));
        worst = Math.max(worst, ours / best);
    }

    // Not a promise of the best route, only a guard that the heuristic stays near it.
    assert.ok(worst < 1.25, `worst ratio ${worst}`);
});

test("the same input always gives the same route", () => {
    const stops = randomStops(30, 99);

    assert.deepStrictEqual(orderStops(origin, stops), orderStops(origin, stops));
});

test("clock times parse and print, and bad times are refused", () => {
    assert.strictEqual(parseClock("08:30"), 510);
    assert.strictEqual(formatClock(510), "8:30 AM");
    assert.strictEqual(formatClock(0), "12:00 AM");
    assert.strictEqual(formatClock(12 * 60 + 5), "12:05 PM");
    assert.strictEqual(formatClock(13 * 60), "1:00 PM");
    assert.throws(() => {
        parseClock("8:30");
    }, RangeError);
    assert.throws(() => {
        parseClock("25:00");
    }, RangeError);
});

test("schedule: two stops at the start still cost the minimum drive, and the totals add up", () => {
    const same = [{ id: 1, ...origin }, { id: 2, ...origin }];

    const { stops, totals } = buildSchedule(origin, same);

    assert.deepStrictEqual(stops.map((stop) => {
        return [stop.arrive, stop.depart];
    }), [["8:35 AM", "8:50 AM"], ["8:55 AM", "9:10 AM"]]);
    assert.strictEqual(totals.travelMinutes, 10);
    assert.strictEqual(totals.serviceMinutes, 30);
    assert.strictEqual(totals.end, "9:10 AM");
    assert.strictEqual(totals.miles, 0);
});

test("schedule: a long leg costs minutesPerMile for each mile plus the buffer", () => {
    const north = { id: 1, lat: origin.lat + 1, lng: origin.lng };

    const { stops } = buildSchedule(origin, [north], { startTime: "07:00" });

    assert.strictEqual(stops[0].legMinutes, Math.floor(stops[0].legMiles * 2 + 5));
    assert.ok(stops[0].legMinutes > 140);
    assert.strictEqual(stops[0].arriveMinutes, 7 * 60 + stops[0].legMinutes);
});

test("schedule options override the defaults, and an empty day ends at the start time", () => {
    const empty = buildSchedule(origin, [], { startTime: "09:15" });
    const slow = buildSchedule(origin, [{ id: 1, ...origin }], {
        serviceMinutes: 30, minTravelMinutes: 10, bufferMinutes: 0,
    });

    assert.strictEqual(empty.totals.end, "9:15 AM");
    assert.strictEqual(slow.stops[0].legMinutes, 10);
    assert.strictEqual(slow.totals.serviceMinutes, 30);
});

test("buildRoute numbers the stops from 1 in driving order", () => {
    const { stops } = buildRoute(origin, randomStops(6, 5));

    assert.deepStrictEqual(stops.map((stop) => {
        return stop.order;
    }), [1, 2, 3, 4, 5, 6]);
});

test("map links: a short day is one link, a long day is chained links that share a stop", () => {
    const short = mapsLinks(["Start", "A", "B"]);
    assert.strictEqual(short.length, 1);
    const shortQuery = new URL(short[0].url).searchParams;
    assert.strictEqual(shortQuery.get("origin"), "Start");
    assert.strictEqual(shortQuery.get("destination"), "B");
    assert.strictEqual(shortQuery.get("waypoints"), "A");

    const addresses = Array.from({ length: 25 }, (unused, index) => {
        return `Stop ${index}`;
    });
    const long = mapsLinks(addresses);
    assert.deepStrictEqual(long.map((link) => {
        return [link.first, link.last];
    }), [[1, 11], [11, 21], [21, 25]]);
    long.slice(1).forEach((link, index) => {
        const startsAt = new URL(link.url).searchParams.get("origin");
        assert.strictEqual(startsAt, new URL(long[index].url).searchParams.get("destination"));
    });
    long.forEach((link) => {
        const waypoints = new URL(link.url).searchParams.get("waypoints");
        assert.ok(!waypoints || waypoints.split("|").length <= 9);
    });
});

test("map links: one address or none gives no link, two give no waypoints, and a pipe is removed", () => {
    assert.deepStrictEqual(mapsLinks([]), []);
    assert.deepStrictEqual(mapsLinks(["Only"]), []);
    assert.strictEqual(new URL(mapsLinks(["A", "B"])[0].url).searchParams.has("waypoints"), false);
    assert.strictEqual(new URL(mapsLinks(["A", "B|C", "D"])[0].url).searchParams.get("waypoints"), "B C");
});
