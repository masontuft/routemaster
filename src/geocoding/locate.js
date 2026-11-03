import * as Property from "../models/property.js";
import { addressText } from "./geocoder.js";

// The most addresses one run looks up. Without a Google key each lookup waits about a second, and a web request
// must finish well inside the host's time limit, so a big list is done over several runs.
export const LOCATE_LIMIT = 15;

// Looks up the properties in ids that have no point yet and saves what it finds. geocode is the function from
// createGeocoder. Returns how many were found, how many have no usable result, and how many were left for next
// time. A service error stops the run, since the next address would very likely fail the same way.
export async function locateProperties(pool, ids, { geocode, state = "", limit = LOCATE_LIMIT }) {
    const due = await Property.needingLocation(pool, ids, limit);
    const result = { found: 0, failed: 0, errored: false, left: 0 };

    for (const property of due) {
        const text = addressText(property, state);
        const answer = text ? await geocode(text) : { status: "none" };

        if (answer.status === "error") {
            result.errored = true;
            break;
        }

        if (answer.status === "found") {
            await Property.saveLocation(pool, property.id, answer);
            result.found += 1;
        } else {
            await Property.markLocationFailed(pool, property.id);
            result.failed += 1;
        }
    }

    const remaining = await Property.needingLocation(pool, ids, ids.length || 1);
    result.left = remaining.length;
    return result;
}
