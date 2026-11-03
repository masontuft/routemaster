// Orders a day's stops into a short drive and works out the times. Pure functions: points in, answers out, no
// database and no network, so every rule here can be tested with a handful of coordinates.
//
// A point is { lat, lng }. The route starts at a fixed start point and ends wherever the last stop falls, with no
// return trip, because the crew finishes at the last customer.

const EARTH_RADIUS_MILES = 3958.8;

// A swap must save more than this to count, so rounding noise cannot make the improvement loop go round forever.
const MIN_GAIN_MILES = 1e-9;
const MAX_PASSES = 50;

// Straight-line distance over the earth's surface. Roads are longer, but the order of stops is what matters here,
// and the drive times are labelled as estimates.
export function haversineMiles(from, to) {
    const toRadians = (degrees) => {
        return degrees * Math.PI / 180;
    };
    const dLat = toRadians(to.lat - from.lat);
    const dLng = toRadians(to.lng - from.lng);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function pathMiles(start, stops) {
    let miles = 0;
    let here = start;

    for (const stop of stops) {
        miles += haversineMiles(here, stop);
        here = stop;
    }

    return miles;
}

// Always drive to the closest stop not yet visited. Quick and simple, but it can leave a long trip back across the
// map at the end, which is what improveByReversing then repairs. A tie goes to the stop listed first, so the same
// input always gives the same route.
export function nearestNeighborOrder(start, stops) {
    const remaining = [...stops];
    const ordered = [];
    let here = start;

    while (remaining.length > 0) {
        let bestIndex = 0;
        let bestMiles = Infinity;

        remaining.forEach((stop, index) => {
            const miles = haversineMiles(here, stop);

            if (miles < bestMiles) {
                bestMiles = miles;
                bestIndex = index;
            }
        });

        here = remaining.splice(bestIndex, 1)[0];
        ordered.push(here);
    }

    return ordered;
}

// 2-opt: take any stretch of the route, drive it backwards instead, and keep that if the whole route gets shorter.
// Two legs that cross each other are always shortened by this. The start is fixed and the end is free, so a stretch
// that runs to the last stop only changes one leg. Repeats until a full pass finds nothing, or MAX_PASSES passes.
export function improveByReversing(start, ordered) {
    const path = [start, ...ordered];
    const last = path.length - 1;

    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
        let improved = false;

        for (let i = 1; i < last; i += 1) {
            for (let j = i + 1; j <= last; j += 1) {
                const hasNext = j < last;
                const before = haversineMiles(path[i - 1], path[i])
                    + (hasNext ? haversineMiles(path[j], path[j + 1]) : 0);
                const after = haversineMiles(path[i - 1], path[j])
                    + (hasNext ? haversineMiles(path[i], path[j + 1]) : 0);

                if (after < before - MIN_GAIN_MILES) {
                    path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse());
                    improved = true;
                }
            }
        }

        if (!improved) {
            break;
        }
    }

    return path.slice(1);
}

export function orderStops(start, stops) {
    return improveByReversing(start, nearestNeighborOrder(start, stops));
}

const DAY_MINUTES = 24 * 60;

// "08:30" to 510 minutes after midnight. Times are whole minutes from midnight, never Date objects, so a time
// zone or a clock change cannot move them.
export function parseClock(text) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(text));

    if (!match) {
        throw new RangeError("Start time must look like 08:30.");
    }

    return Number(match[1]) * 60 + Number(match[2]);
}

export function formatClock(minutes) {
    const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const hour = Math.floor(wrapped / 60);
    const minute = String(wrapped % 60).padStart(2, "0");
    return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

export const DEFAULT_TIMING = {
    startTime: "08:30",
    serviceMinutes: 15,
    minutesPerMile: 2,
    bufferMinutes: 5,
    minTravelMinutes: 5,
};

// Times for each leg and stop. A leg takes minutesPerMile for each mile plus a buffer, and never less than the
// minimum (the same rule as the original script). The first leg is from the start point to the first stop.
export function buildSchedule(start, ordered, options = {}) {
    const timing = { ...DEFAULT_TIMING, ...options };
    let clock = parseClock(timing.startTime);
    let here = start;
    let travelMinutes = 0;
    let miles = 0;

    const stops = ordered.map((stop, index) => {
        const legMiles = haversineMiles(here, stop);
        const legMinutes = Math.max(
            timing.minTravelMinutes,
            Math.floor(legMiles * timing.minutesPerMile + timing.bufferMinutes),
        );
        const arriveAt = clock + legMinutes;
        clock = arriveAt + timing.serviceMinutes;
        travelMinutes += legMinutes;
        miles += legMiles;
        here = stop;

        return {
            ...stop,
            order: index + 1,
            legMiles,
            legMinutes,
            arriveMinutes: arriveAt,
            departMinutes: clock,
            arrive: formatClock(arriveAt),
            depart: formatClock(clock),
        };
    });

    return {
        stops,
        totals: {
            miles,
            travelMinutes,
            serviceMinutes: ordered.length * timing.serviceMinutes,
            endMinutes: clock,
            end: formatClock(clock),
        },
    };
}

// Order and time a day in one call. start and every stop need lat and lng.
export function buildRoute(start, stops, options = {}) {
    return buildSchedule(start, orderStops(start, stops), options);
}

// Google Maps will only plot a limited number of points in one link, so a long day becomes several links, each
// starting where the last one stopped. addresses are the text to navigate to, in driving order, start first.
// Links use the documented "api=1" form, which allows up to 9 stops between the start and the end.
export const MAPS_POINTS_PER_LINK = 11;

export function mapsLinks(rawAddresses, pointsPerLink = MAPS_POINTS_PER_LINK) {
    // A "|" in an address would be read as the break between two waypoints.
    const addresses = rawAddresses.map((address) => {
        return String(address).replaceAll("|", " ");
    });
    const links = [];

    for (let from = 0; from < addresses.length - 1; from += pointsPerLink - 1) {
        const part = addresses.slice(from, from + pointsPerLink);

        if (part.length < 2) {
            break;
        }

        const query = new globalThis.URLSearchParams({
            api: "1", origin: part[0], destination: part.at(-1), travelmode: "driving",
        });

        if (part.length > 2) {
            query.set("waypoints", part.slice(1, -1).join("|"));
        }

        links.push({ first: from + 1, last: from + part.length, url: `https://www.google.com/maps/dir/?${query}` });
    }

    return links;
}
