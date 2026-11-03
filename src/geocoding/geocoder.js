// Turns an address into a point. Google is asked first when a key is set, then OpenStreetMap's Nominatim.
// The answer is one of:
//   { status: "found", lat, lng, source }   a usable point
//   { status: "none" }                      the services answered and have nothing usable for this address
//   { status: "error", reason }             a service could not be reached or refused (quota, bad key, network),
//                                           so the address may be fine and should be tried again later
// Neither the key nor the request URL is ever put in a result or an error, because the key is in the URL.

const GOOGLE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const TIMEOUT_MS = 8000;

// Nominatim's usage policy allows one request a second.
const NOMINATIM_GAP_MS = 1100;

// Google marks how exact a point is. APPROXIMATE is a city or street centre, which would put a stop in the wrong
// place on the map, so it is treated as not found and the address goes to staff to fix.
const EXACT_ENOUGH = new Set(["ROOFTOP", "RANGE_INTERPOLATED", "GEOMETRIC_CENTER"]);

export function isValidPoint(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// Street, city, state and ZIP, skipping whatever is blank. A property with neither city nor ZIP is too vague to
// look up, so it has no text and the caller records it as not found without asking a service.
export function addressText({ street, city, zip }, state = "") {
    if (!street || (!city && !zip)) {
        return null;
    }

    const place = [state, zip].filter(Boolean).join(" ");
    return [street, city, place].filter(Boolean).join(", ");
}

async function getJson(fetchFn, url, headers) {
    const response = await fetchFn(url, { headers, signal: globalThis.AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });

    if (!response.ok) {
        throw new Error(`status ${response.status}`);
    }

    return response.json();
}

async function askGoogle(fetchFn, address, apiKey) {
    const url = `${GOOGLE_URL}?${new globalThis.URLSearchParams({ address, key: apiKey, region: "us" })}`;
    const data = await getJson(fetchFn, url, {});

    if (data.status === "ZERO_RESULTS") {
        return { status: "none" };
    }

    if (data.status !== "OK") {
        return { status: "error", reason: `google ${data.status}` };
    }

    const best = data.results?.[0];
    const point = best?.geometry?.location;

    if (!EXACT_ENOUGH.has(best?.geometry?.location_type) || !isValidPoint(point?.lat, point?.lng)) {
        return { status: "none" };
    }

    return { status: "found", lat: point.lat, lng: point.lng, source: "google" };
}

async function askNominatim(fetchFn, address, userAgent) {
    const query = new globalThis.URLSearchParams({ q: address, format: "json", limit: "1", countrycodes: "us" });
    const data = await getJson(fetchFn, `${NOMINATIM_URL}?${query}`, { "User-Agent": userAgent });
    const best = Array.isArray(data) ? data[0] : null;

    if (!best) {
        return { status: "none" };
    }

    const lat = Number(best.lat);
    const lng = Number(best.lon);
    return isValidPoint(lat, lng) ? { status: "found", lat, lng, source: "nominatim" } : { status: "none" };
}

// Anything thrown (timeout, DNS, bad JSON) becomes an error result with a fixed word, never the raw message,
// because a raw message can carry the URL.
async function attempt(label, work) {
    try {
        return await work();
    } catch {
        return { status: "error", reason: `${label} unreachable` };
    }
}

// apiKey is optional. fetchFn, sleep and now can be replaced in tests.
export function createGeocoder({
    apiKey = "",
    userAgent = "Routemaster/1.0",
    fetchFn = globalThis.fetch,
    sleep = (ms) => {
        return new Promise((resolve) => {
            globalThis.setTimeout(resolve, ms);
        });
    },
    now = Date.now,
} = {}) {
    let lastNominatimAt = 0;

    async function throttledNominatim(address) {
        const wait = lastNominatimAt + NOMINATIM_GAP_MS - now();

        if (wait > 0) {
            await sleep(wait);
        }

        lastNominatimAt = now();
        return askNominatim(fetchFn, address, userAgent);
    }

    return async function geocode(address) {
        let google = { status: "none" };

        if (apiKey) {
            google = await attempt("google", () => {
                return askGoogle(fetchFn, address, apiKey);
            });

            if (google.status === "found") {
                return google;
            }
        }

        const osm = await attempt("nominatim", () => {
            return throttledNominatim(address);
        });

        if (osm.status === "found") {
            return osm;
        }

        // A service that errored might have found it, so the address is not called "none" on a half answer.
        return [google, osm].find((result) => {
            return result.status === "error";
        }) ?? { status: "none" };
    };
}
