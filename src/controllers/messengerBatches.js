import * as Area from "../models/area.js";
import * as LinkBatch from "../models/linkBatch.js";
import * as MessengerBatch from "../models/messengerBatch.js";
import { expoGoLink } from "../utils/devAddress.js";
import { isProduction } from "../utils/env.js";
import { notFound } from "../utils/errors.js";
import { parseId, todayString, validateLinkBatch, DEFAULT_LINK_MESSAGE } from "../utils/validation.js";

// Every page here carries names, or a deep link that opens a batch of them, so none may be cached or replayed.
async function formPage(req, res, { values, errors = [], status = 200 }) {
    const db = req.app.locals.db;
    const areas = await Area.list(db, todayString());
    const preview = values.areaId ? await LinkBatch.preview(db, values.areaId, values) : null;
    res.set("Cache-Control", "no-store");
    res.status(status).render("staff/messenger-batch-new", {
        title: "Stage Links for Messenger", areas, values, errors, preview, max: MessengerBatch.MAX_BATCH,
    });
}

export async function showNew(req, res) {
    const values = {
        areaId: parseId(req.query.areaId), days: 30, includeActive: req.query.includeActive === "1",
        template: DEFAULT_LINK_MESSAGE,
    };
    await formPage(req, res, { values });
}

export async function create(req, res) {
    const db = req.app.locals.db;
    const { values, errors } = validateLinkBatch(req.body);

    if (errors.length > 0) {
        return formPage(req, res, { values: { ...values, days: req.body.days }, errors, status: 400 });
    }

    const area = await Area.find(db, values.areaId);

    if (!area) {
        throw notFound();
    }

    const { customerIds, noPhone, skippedActive } = await LinkBatch.textableInArea(db, values.areaId, values);
    const staged = await MessengerBatch.stage(db, {
        createdBy: req.session.user.id, customerIds, messageTemplate: values.template, days: values.days,
    });

    if (staged.error === "empty") {
        return formPage(req, res, { values, status: 400, errors: ["There is nobody in that area to text."] });
    }

    if (staged.error === "too_many") {
        return formPage(req, res, {
            values, status: 400,
            errors: [`That would stage ${staged.count} customers. A batch holds at most ${MessengerBatch.MAX_BATCH}.`],
        });
    }

    // The token exists only in this response, as for a magic link. Refreshing the page would stage a second batch.
    res.set("Cache-Control", "no-store");
    res.render("staff/messenger-batch-created", {
        title: "Batch Staged",
        areaName: area.name,
        batchId: staged.batchId,
        staged: staged.staged,
        noPhone,
        skippedActive,
        days: values.days,
        fetchMinutes: MessengerBatch.FETCH_MINUTES,
        resultsHours: MessengerBatch.RESULTS_HOURS,
        deepLink: `sprinklermessenger://batch/${staged.token}`,
        // Expo Go cannot open the custom scheme, so development also gets its own form of the link.
        expoLink: isProduction() ? null : expoGoLink(staged.token),
    });
}

export async function index(req, res) {
    const batches = await MessengerBatch.list(req.app.locals.db);
    res.set("Cache-Control", "no-store");
    res.render("staff/messenger-batches", { title: "Messenger Batches", batches });
}

export async function show(req, res) {
    const id = parseId(req.params.id);
    const batch = id ? await MessengerBatch.find(req.app.locals.db, id) : null;

    if (!batch) {
        throw notFound();
    }

    res.set("Cache-Control", "no-store");
    res.render("staff/messenger-batch", { title: `Messenger Batch ${batch.id}`, batch });
}
