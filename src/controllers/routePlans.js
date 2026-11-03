import * as Property from "../models/property.js";
import * as RoutePlan from "../models/routePlan.js";
import { locateProperties } from "../geocoding/locate.js";
import { addressText } from "../geocoding/geocoder.js";
import { buildRoute, formatClock, mapsLinks } from "../routing/engine.js";
import { todayString, validateRouteBuild } from "../utils/validation.js";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dayFrom(value) {
    const asked = String(value ?? "");
    return DAY_PATTERN.test(asked) && !Number.isNaN(Date.parse(`${asked}T00:00:00Z`)) ? asked : todayString();
}

// What a driver navigates to: street, city, state and ZIP when known, or just the street.
function navigationText(stop, state) {
    return addressText(stop, state) ?? stop.street;
}

function joinNotes(stop) {
    return [stop.request_notes, stop.property_notes].filter(Boolean).join(" / ");
}

// Every page here carries names, phones and addresses, so none may be cached.
async function routePage(req, res, { day, values, errors = [], notice = null, status = 200 }) {
    const db = req.app.locals.db;
    const state = req.app.locals.serviceState;
    const booked = await RoutePlan.bookedForDay(db, day);
    const saved = await RoutePlan.findForDay(db, day);
    const located = booked.filter((stop) => {
        return stop.geocode_status === "ok";
    });
    const pending = booked.filter((stop) => {
        return stop.geocode_status === "pending";
    });
    const failed = booked.filter((stop) => {
        return stop.geocode_status === "failed";
    });
    let route = null;

    if (saved) {
        const bookedIds = booked.map((stop) => {
            return stop.request_id;
        }).sort();
        const savedIds = saved.stops.map((stop) => {
            return stop.request_id;
        }).sort();
        const stops = saved.stops.map((stop) => {
            return {
                ...stop,
                arrive: formatClock(stop.arrive_minutes),
                depart: formatClock(stop.depart_minutes),
                notes: joinNotes(stop),
                navigation: navigationText(stop, state),
            };
        });
        route = {
            ...saved,
            stops,
            stale: bookedIds.join() !== savedIds.join(),
            links: mapsLinks([saved.start_address, ...stops.map((stop) => {
                return stop.navigation;
            })]),
            end: formatClock(stops.at(-1).depart_minutes),
        };
    }

    const form = values ?? {
        startAddress: saved?.start_address ?? req.app.locals.routeStart ?? "",
        startTime: saved?.start_time ?? "08:30",
        serviceMinutes: saved?.service_minutes ?? 15,
    };

    res.set("Cache-Control", "no-store");
    res.status(status).render("staff/route", {
        title: "Route Builder", day, today: todayString(), booked, located, pending, failed, route, form, errors, notice,
    });
}

export async function show(req, res) {
    await routePage(req, res, { day: dayFrom(req.query.day) });
}

// Looks up map points for the day's jobs that have none. With retryFailed, addresses that found nothing before are
// put back in line first, for after staff have fixed them.
export async function locate(req, res) {
    const db = req.app.locals.db;
    const day = dayFrom(req.body.day);
    const booked = await RoutePlan.bookedForDay(db, day);
    const ids = booked.map((stop) => {
        return stop.property_id;
    });

    if (req.body.retryFailed === "1") {
        await Property.retryFailedLocations(db, ids);
    }

    const result = await locateProperties(db, ids, {
        geocode: req.app.locals.geocode, state: req.app.locals.serviceState,
    });
    const parts = [`Found ${result.found}.`];

    if (result.failed > 0) {
        parts.push(`${result.failed} could not be found, so check those addresses.`);
    }

    if (result.errored) {
        parts.push("A map service did not answer. Try again in a minute.");
    } else if (result.left > 0) {
        parts.push(`${result.left} still to look up. Run it again.`);
    }

    await routePage(req, res, { day, notice: parts.join(" ") });
}

export async function build(req, res) {
    const { values, errors } = validateRouteBuild(req.body);
    const day = dayFrom(values.day);

    if (errors.length > 0) {
        return routePage(req, res, { day, values, errors, status: 400 });
    }

    const db = req.app.locals.db;
    const booked = await RoutePlan.bookedForDay(db, day);
    const located = booked.filter((stop) => {
        return stop.geocode_status === "ok";
    });

    if (located.length === 0) {
        return routePage(req, res, {
            day, values, status: 400, errors: ["No booked job for this day has a map point yet. Find locations first."],
        });
    }

    const startPoint = await req.app.locals.geocode(values.startAddress);

    if (startPoint.status !== "found") {
        const message = startPoint.status === "none"
            ? "The start address could not be found. Check it and try again."
            : "A map service did not answer. Try again in a minute.";
        return routePage(req, res, { day, values, errors: [message], status: startPoint.status === "none" ? 400 : 502 });
    }

    const start = { lat: startPoint.lat, lng: startPoint.lng };
    const stops = located.map((stop) => {
        return { requestId: stop.request_id, lat: stop.latitude, lng: stop.longitude };
    });
    const schedule = buildRoute(start, stops, {
        startTime: values.startTime, serviceMinutes: values.serviceMinutes,
    });

    await RoutePlan.replaceForDay(db, {
        day,
        createdBy: req.session.user.id,
        start: { address: values.startAddress, ...start },
        startTime: values.startTime,
        serviceMinutes: values.serviceMinutes,
        totals: schedule.totals,
        stops: schedule.stops,
    });

    const left = booked.length - located.length;
    const note = left > 0 ? ` ${left} booked ${left === 1 ? "job was" : "jobs were"} left off because it has no map point.` : "";
    await routePage(req, res, { day, notice: `Route built with ${located.length} stops.${note}` });
}
