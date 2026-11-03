import * as Customer from "../models/customer.js";
import * as Property from "../models/property.js";
import * as Area from "../models/area.js";
import * as ServiceRequest from "../models/serviceRequest.js";
import * as Staff from "../models/staff.js";
import * as DayBoard from "../models/dayBoard.js";
import * as RoutePlan from "../models/routePlan.js";

// Fictional people and streets, with fixed map points so seeding never calls a lookup service.
const START = { address: "100 Depot Way, Riverbend, ID", lat: 43.4917, lng: -112.0339 };
const AREAS = ["Willow Creek", "Heron Landing"];
const CUSTOMERS = [
    { name: "Avery Holt", street: "12 Willow Creek Dr", area: 0, lat: 43.4931, lng: -112.0412, outcome: "Scheduled" },
    { name: "Blake Ortiz", street: "48 Willow Creek Dr", area: 0, lat: 43.4944, lng: -112.0388, outcome: "Scheduled" },
    { name: "Casey Lindqvist", street: "7 Cattail Ct", area: 0, lat: 43.4958, lng: -112.0431, outcome: "Scheduled" },
    { name: "Drew Maddox", street: "230 Heron Landing Rd", area: 1, lat: 43.5012, lng: -112.0256, outcome: "Requested" },
    { name: "Emery Castellanos", street: "231 Heron Landing Rd", area: 1, lat: 43.5015, lng: -112.0251, outcome: "Requested" },
    { name: "Finley Broadbent", street: "19 Egret Ln", area: 1, lat: 43.5039, lng: -112.0229, outcome: "Requested" },
    { name: "Gray Nakamura", street: "5 Willow Creek Dr", area: 0, lat: 43.4927, lng: -112.0421, outcome: "Completed" },
    { name: "Harper Quist", street: "88 Egret Ln", area: 1, lat: 43.5047, lng: -112.0214, outcome: "Cancelled" },
];
const SERVICE_MINUTES = 20;
const MARKER_EMAIL = "seed.customer1@example.com";

function isoDay(today, offset) {
    return new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
}

// Straight-line miles between two map points, enough for believable numbers on a seeded route.
function miles(from, to) {
    const radius = 3958.8;
    const rad = Math.PI / 180;
    const a = Math.sin(((to.lat - from.lat) * rad) / 2) ** 2
        + Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(((to.lng - from.lng) * rad) / 2) ** 2;
    return 2 * radius * Math.asin(Math.sqrt(a));
}

// Adds the sample customers, areas, requests in every status, and one built route for tomorrow. Dates are relative
// to today, so the data never goes stale. Returns { seeded: false } when it has already run: the first sample
// customer's email is the marker. Not transactional, so after a failed run start over with --reset.
export async function seedTestData(pool, { today = new Date(), dispatcherId = null } = {}) {
    const marker = await pool.query("SELECT 1 FROM customers WHERE email = $1", [MARKER_EMAIL]);

    if (marker.rowCount > 0) {
        return { seeded: false };
    }

    const types = await pool.query("SELECT id FROM service_types ORDER BY id LIMIT 1");
    const serviceTypeId = types.rows[0].id;
    const workDay = isoDay(today, 1);

    const areaIds = [];
    for (const name of AREAS) {
        const id = await Area.create(pool, name);
        await Area.addDays(pool, id, [1, 2, 3].map((offset) => {
            return isoDay(today, offset);
        }));
        areaIds.push(id);
    }

    const requests = [];
    for (const [index, sample] of CUSTOMERS.entries()) {
        const customerId = await Customer.create(pool, {
            name: sample.name, phone: `208-555-01${String(index).padStart(2, "0")}`,
            email: `seed.customer${index + 1}@example.com`,
        });
        const propertyId = await Property.create(pool, customerId, { street: sample.street, city: "Riverbend", zip: "83401" });
        await Property.saveLocation(pool, propertyId, { lat: sample.lat, lng: sample.lng });
        await pool.query("UPDATE properties SET subdivision_id = $2 WHERE id = $1", [propertyId, areaIds[sample.area]]);
        const requestId = await ServiceRequest.create(pool, {
            customerId, propertyId, serviceTypeId, preferredDate: workDay, notes: "Seeded sample request",
        });
        requests.push({ ...sample, requestId });
    }

    const toBook = requests.filter((request) => {
        return request.outcome === "Scheduled" || request.outcome === "Completed";
    });
    await DayBoard.scheduleMany(pool, toBook.map((request) => {
        return request.requestId;
    }), { day: workDay, changedBy: dispatcherId });

    for (const request of requests) {
        if (request.outcome === "Completed" || request.outcome === "Cancelled") {
            await Staff.changeStatus(pool, request.requestId, { to: request.outcome, changedBy: dispatcherId });
        }
    }

    const stops = [];
    let previous = START;
    let clock = 8 * 60;
    for (const request of requests.filter((item) => {
        return item.outcome === "Scheduled";
    })) {
        const legMiles = miles(previous, request);
        const legMinutes = Math.max(1, Math.round((legMiles / 25) * 60));
        stops.push({
            requestId: request.requestId, legMiles, legMinutes,
            arriveMinutes: clock + legMinutes, departMinutes: clock + legMinutes + SERVICE_MINUTES,
        });
        clock += legMinutes + SERVICE_MINUTES;
        previous = request;
    }

    await RoutePlan.replaceForDay(pool, {
        day: workDay, createdBy: dispatcherId, start: START, startTime: "08:00", serviceMinutes: SERVICE_MINUTES,
        totals: {
            miles: stops.reduce((sum, stop) => {
                return sum + stop.legMiles;
            }, 0),
            travelMinutes: stops.reduce((sum, stop) => {
                return sum + stop.legMinutes;
            }, 0),
        },
        stops,
    });

    return { seeded: true, customers: requests.length, route: workDay };
}
