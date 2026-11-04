import * as DayBoard from "../models/dayBoard.js";
import * as AppSetting from "../models/appSetting.js";
import { parseId, todayString, validatePreferredDate } from "../utils/validation.js";

// Every page here carries customer names and phones, so none may be cached.
async function boardPage(req, res, { day, errors = [], notice = null, status = 200 }) {
    const db = req.app.locals.db;
    const today = todayString();
    const board = await DayBoard.forDay(db, day);
    const busyDays = await DayBoard.busyDays(db, today);
    const allowTentative = await AppSetting.allowsTentativeBooking(db);
    const candidates = allowTentative && day >= today ? await DayBoard.pencilInCandidates(db, day) : [];
    res.set("Cache-Control", "no-store");
    res.status(status).render("staff/day-board", {
        title: "Day Board", day, today, board, busyDays, errors, notice, allowTentative, candidates,
    });
}

// A missing or invalid day falls back to today. Past days are allowed to view, so staff can look back.
export async function show(req, res) {
    const asked = String(req.query.day ?? "");
    const day = /^\d{4}-\d{2}-\d{2}$/.test(asked) && !Number.isNaN(Date.parse(`${asked}T00:00:00Z`))
        ? asked
        : todayString();
    await boardPage(req, res, { day });
}

// requestIds arrives as one string when one box is ticked and as an array when several are, so both are accepted.
// Duplicates are dropped so a repeated id cannot be counted twice.
export async function schedule(req, res) {
    const day = String(req.body.day ?? "");
    const dayError = validatePreferredDate(day);
    const ids = [...new Set([].concat(req.body.requestIds ?? []).map(parseId).filter(Boolean))];
    const errors = [];

    if (dayError) {
        errors.push(dayError);
    }

    if (ids.length === 0) {
        errors.push("Tick at least one request to schedule.");
    }

    if (ids.length > DayBoard.MAX_SCHEDULE) {
        errors.push(`Schedule at most ${DayBoard.MAX_SCHEDULE} requests at a time.`);
    }

    if (errors.length > 0) {
        const shownDay = dayError ? todayString() : day;
        return boardPage(req, res, { day: shownDay, errors, status: 400 });
    }

    const result = await DayBoard.scheduleMany(req.app.locals.db, ids, {
        day, changedBy: req.session.user.id,
    });
    const skippedText = result.skipped > 0 ? ` ${result.skipped} could not be scheduled (already booked or cancelled).` : "";
    await boardPage(req, res, { day, notice: `Scheduled ${result.scheduled} for ${day}.${skippedText}` });
}

// Pencils customers in who have not asked for the day. Only if the owner allowed it in the settings, and the server
// picks each customer's property and service, so the form carries nothing but the day and the customer ids.
export async function pencilIn(req, res) {
    const db = req.app.locals.db;
    const day = String(req.body.day ?? "");
    const dayError = validatePreferredDate(day);
    const ids = [...new Set([].concat(req.body.customerIds ?? []).map(parseId).filter(Boolean))];
    const errors = [];

    if (!await AppSetting.allowsTentativeBooking(db)) {
        errors.push("Booking customers who have not confirmed is turned off. The owner can turn it on in Settings.");
    }

    if (dayError) {
        errors.push(dayError);
    }

    if (ids.length === 0) {
        errors.push("Tick at least one customer to pencil in.");
    }

    if (ids.length > DayBoard.MAX_SCHEDULE) {
        errors.push(`Pencil in at most ${DayBoard.MAX_SCHEDULE} customers at a time.`);
    }

    if (errors.length > 0) {
        return boardPage(req, res, { day: dayError ? todayString() : day, errors, status: 400 });
    }

    const result = await DayBoard.pencilIn(db, ids, { day, changedBy: req.session.user.id });
    const skippedText = result.skipped > 0
        ? ` ${result.skipped} could not be penciled in (no property in an area that works that day, or already booked this year).`
        : "";
    await boardPage(req, res, { day, notice: `Penciled in ${result.pencilledIn} for ${day}.${skippedText}` });
}
