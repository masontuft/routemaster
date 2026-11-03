import * as Customer from "../models/customer.js";
import * as ImportBatch from "../models/importBatch.js";
import { notFound } from "../utils/errors.js";
import { parseId } from "../utils/validation.js";

const COUNT_KEYS = ["customers", "properties", "requests", "reviews", "links"];
const ALL_PHRASE = "delete all customers";

// The counts the owner saw come back as hidden fields. Anything that is not a plain whole number fails the match.
function expectedCounts(body) {
    const expected = {};

    for (const key of COUNT_KEYS) {
        expected[key] = parseId(body[key]);
    }

    return expected;
}

function confirmPage(res, { batch = null, counts, errors = [], status = 200 }) {
    res.set("Cache-Control", "no-store");
    res.status(status).render("admin/clear-confirm", { title: "Confirm Delete", batch, counts, errors, phrase: ALL_PHRASE });
}

export async function showClear(req, res) {
    const deleted = parseId(req.query.deleted);
    const batches = await ImportBatch.listWithRemaining(req.app.locals.db);
    res.set("Cache-Control", "no-store");
    res.render("admin/clear", { title: "Clear Customers", batches, deleted });
}

async function loadBatch(req) {
    const id = parseId(req.params.id);
    const db = req.app.locals.db;
    const batch = id && await ImportBatch.find(db, id);

    if (!batch) {
        throw notFound();
    }

    return batch;
}

export async function showClearBatch(req, res) {
    const batch = await loadBatch(req);
    confirmPage(res, { batch, counts: await Customer.countClear(req.app.locals.db, batch.id) });
}

export async function clearBatch(req, res) {
    const batch = await loadBatch(req);
    const result = await Customer.clear(req.app.locals.db, batch.id, expectedCounts(req.body));

    if (!result.deleted) {
        return confirmPage(res, {
            batch, counts: result.counts, status: 409,
            errors: ["The numbers changed since you looked. Check them and confirm again."],
        });
    }

    res.redirect(303, `/admin/clear?deleted=${result.counts.customers}`);
}

export async function showClearAll(req, res) {
    confirmPage(res, { counts: await Customer.countClear(req.app.locals.db, null) });
}

export async function clearAll(req, res) {
    const db = req.app.locals.db;
    const typed = String(req.body.phrase ?? "").trim().toLowerCase();

    if (typed !== ALL_PHRASE) {
        return confirmPage(res, {
            counts: await Customer.countClear(db, null), status: 400,
            errors: [`Type "${ALL_PHRASE}" exactly to confirm.`],
        });
    }

    const result = await Customer.clear(db, null, expectedCounts(req.body));

    if (!result.deleted) {
        return confirmPage(res, {
            counts: result.counts, status: 409,
            errors: ["The numbers changed since you looked. Check them and confirm again."],
        });
    }

    res.redirect(303, `/admin/clear?deleted=${result.counts.customers}`);
}
