import * as Area from "../models/area.js";
import * as LinkBatch from "../models/linkBatch.js";
import * as MessengerBatch from "../models/messengerBatch.js";
import { expoGoLink } from "../utils/devAddress.js";
import { isProduction } from "../utils/env.js";
import { notFound } from "../utils/errors.js";
import { qrSvg } from "../utils/qr.js";
import { parseId, todayString, validateLinkBatch, isValidLinkMessage, DEFAULT_LINK_MESSAGE } from "../utils/validation.js";
import { companyOf } from "../utils/company.js";

// Every page here carries names, or a deep link that opens a batch of them, so none may be cached or replayed.
async function formPage(req, res, { values, errors = [], status = 200 }) {
    const db = req.app.locals.db;
    const areas = await Area.list(db, companyOf(req), todayString());
    const preview = values.areaId ? await LinkBatch.preview(db, companyOf(req), values.areaId, values) : null;
    res.set("Cache-Control", "no-store");
    res.status(status).render("staff/messenger-batch-new", {
        title: "Stage Links for Messenger", areas, values, errors, preview, max: MessengerBatch.MAX_BATCH,
    });
}

// The page after staging. The token exists only in this response, as for a magic link, so refreshing the page that
// posted here would stage a second batch.
// fromBatchId is set when the batch was staged again from an earlier one, and then there is no area to name.
function renderCreated(res, { staged, areaName = null, fromBatchId = null, days, noPhone = 0, skippedActive = 0 }) {
    const deepLink = `sprinklermessenger://batch/${staged.token}`;
    // Expo Go cannot open the custom scheme, so development also gets its own form of the link.
    const expoLink = isProduction() ? null : expoGoLink(staged.token);

    res.set("Cache-Control", "no-store");
    res.render("staff/messenger-batch-created", {
        title: "Batch Staged",
        areaName,
        fromBatchId,
        batchId: staged.batchId,
        staged: staged.staged,
        noPhone,
        skippedActive,
        days,
        fetchMinutes: MessengerBatch.FETCH_MINUTES,
        resultsHours: MessengerBatch.RESULTS_HOURS,
        deepLink,
        deepQr: qrSvg(deepLink, "QR code for the Messenger link"),
        expoLink,
        expoQr: expoLink ? qrSvg(expoLink, "QR code for the Expo Go link") : null,
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

    const area = await Area.find(db, companyOf(req), values.areaId);

    if (!area) {
        throw notFound();
    }

    const { customerIds, noPhone, skippedActive } = await LinkBatch.textableInArea(
        db, companyOf(req), values.areaId, values,
    );
    const staged = await MessengerBatch.stage(db, companyOf(req), {
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

    renderCreated(res, { staged, areaName: area.name, days: values.days, noPhone, skippedActive });
}

// Starts a Messenger batch from the results page of a link batch, for the customers that batch made links for.
export async function createFromLinkBatch(req, res) {
    const linkBatchId = parseId(req.body.linkBatchId);
    const template = String(req.body.template ?? "").trim();

    if (!linkBatchId || !isValidLinkMessage(template)) {
        throw notFound();
    }

    const staged = await MessengerBatch.stageFromLinkBatch(req.app.locals.db, companyOf(req), linkBatchId, {
        createdBy: req.session.user.id, messageTemplate: template,
    });

    if (staged.error === "not_found") {
        throw notFound();
    }

    // Nobody left to text. A link batch holds at most MAX_BATCH customers, so "too_many" cannot happen here. The form
    // comes back with no area chosen: an area preview would list the area's customers, not the batch's, beside a
    // message about the batch.
    if (staged.error) {
        return formPage(req, res, {
            values: { areaId: null, days: staged.days, includeActive: false, template },
            errors: ["Nobody in that batch can be texted. Their links may have been revoked or have expired, or they have no usable phone."],
            status: 400,
        });
    }

    renderCreated(res, { staged, areaName: staged.areaName, days: staged.days, noPhone: staged.noPhone });
}

export async function index(req, res) {
    const batches = await MessengerBatch.list(req.app.locals.db, companyOf(req));
    res.set("Cache-Control", "no-store");
    res.render("staff/messenger-batches", { title: "Messenger Batches", batches });
}

function renderShow(res, batch, { errors = [], status = 200 } = {}) {
    res.set("Cache-Control", "no-store");
    res.status(status).render("staff/messenger-batch", { title: `Messenger Batch ${batch.id}`, batch, errors });
}

export async function show(req, res) {
    const id = parseId(req.params.id);
    const batch = id ? await MessengerBatch.find(req.app.locals.db, companyOf(req), id) : null;

    if (!batch) {
        throw notFound();
    }

    renderShow(res, batch);
}

// Stages a new batch for everyone in this one who is not marked sent. Customers Messenger never reported on may have
// been texted already, so the form's checkbox must be ticked when there are any, and the model refuses without it.
export async function stageAgain(req, res) {
    const db = req.app.locals.db;
    const id = parseId(req.params.id);
    const staged = id ? await MessengerBatch.stageAgain(db, companyOf(req), id, {
        createdBy: req.session.user.id, confirmUnreported: req.body.confirmUnreported === "1",
    }) : { error: "not_found" };

    if (staged.error === "not_found") {
        throw notFound();
    }

    if (staged.error) {
        // A batch holds at most MAX_BATCH recipients, so "too_many" cannot come back here. Anything not named is a bug,
        // and says so as an error rather than showing staff a wrong reason.
        const reasons = {
            needs_confirmation: "Tick the box to confirm that the customers not yet reported were not texted, then stage again.",
            empty: "Nobody in that batch can be texted again. Everyone was sent, or has no usable phone.",
        };

        if (!reasons[staged.error]) {
            throw new Error(`Unexpected stage again result: ${staged.error}`);
        }

        const batch = await MessengerBatch.find(db, companyOf(req), id);
        return renderShow(res, batch, { errors: [reasons[staged.error]], status: 400 });
    }

    renderCreated(res, { staged, fromBatchId: staged.fromBatchId, days: staged.days });
}
