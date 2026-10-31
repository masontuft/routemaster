import * as Review from "../models/review.js";
import * as ContactMessage from "../models/contactMessage.js";
import { notFound } from "../utils/errors.js";
import { parseId } from "../utils/validation.js";

export async function listReviews(req, res) {
    res.render("staff/reviews", { title: "Reviews", reviews: await Review.listAll(req.app.locals.db) });
}

function reviewAction(work) {
    return async (req, res) => {
        const id = parseId(req.params.id);

        if (!id || !await work(req.app.locals.db, id)) {
            throw notFound();
        }

        res.redirect("/staff/reviews");
    };
}

export const hideReview = reviewAction((db, id) => {
    return Review.setHidden(db, id, true);
});
export const restoreReview = reviewAction((db, id) => {
    return Review.setHidden(db, id, false);
});
export const deleteReview = reviewAction((db, id) => {
    return Review.remove(db, id);
});

export async function listMessages(req, res) {
    res.render("staff/messages", { title: "Messages", messages: await ContactMessage.list(req.app.locals.db) });
}

async function loadMessage(req) {
    const id = parseId(req.params.id);
    const message = id && await ContactMessage.find(req.app.locals.db, id);

    if (!message) {
        throw notFound();
    }

    return message;
}

export async function showMessage(req, res) {
    const message = await loadMessage(req);
    res.render("staff/message", { title: `Message ${message.id}`, message, errors: [] });
}

export async function replyMessage(req, res) {
    const message = await loadMessage(req);
    const note = String(req.body.note ?? "").trim();

    if (!note || note.length > 1000) {
        return res.status(400).render("staff/message", {
            title: `Message ${message.id}`, message, errors: ["Enter a reply note of up to 1000 characters."],
        });
    }

    await ContactMessage.reply(req.app.locals.db, message.id, note, req.session.user.id);
    res.redirect(`/staff/messages/${message.id}`);
}
