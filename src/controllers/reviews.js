import * as Review from "../models/review.js";
import * as ServiceRequest from "../models/serviceRequest.js";
import { notFound } from "../utils/errors.js";
import { parseId, validateReview } from "../utils/validation.js";

export async function listPublic(req, res) {
    const db = req.app.locals.db;
    const [reviews, summary] = await Promise.all([Review.listPublic(db), Review.averageRating(db)]);
    res.render("reviews/index", { title: "Reviews", reviews, summary });
}

// Only a Completed request the customer owns can be reviewed; anything else is a 404 so ids cannot be probed.
async function completedRequest(req) {
    const id = parseId(req.params.id);
    const request = id && await ServiceRequest.findForCustomer(req.app.locals.db, id, req.session.user.customerId);

    if (!request || request.status !== "Completed") {
        throw notFound();
    }

    return request;
}

export async function showForm(req, res) {
    const request = await completedRequest(req);
    const review = await Review.findForRequest(req.app.locals.db, request.id, req.session.user.customerId);
    res.render("reviews/form", {
        title: review ? "Edit Review" : "Leave a Review", request, review, errors: [],
        values: { rating: review?.rating ?? "", body: review?.body ?? "" },
    });
}

export async function save(req, res) {
    const request = await completedRequest(req);
    const db = req.app.locals.db;
    const { customerId } = req.session.user;
    const { values, errors } = validateReview(req.body);

    if (errors.length) {
        const review = await Review.findForRequest(db, request.id, customerId);
        return res.status(400).render("reviews/form", {
            title: review ? "Edit Review" : "Leave a Review", request, review, errors, values,
        });
    }

    await Review.save(db, { requestId: request.id, customerId, ...values });
    res.redirect(`/requests/${request.id}`);
}

export async function remove(req, res) {
    const request = await completedRequest(req);
    await Review.removeOwn(req.app.locals.db, request.id, req.session.user.customerId);
    res.redirect(`/requests/${request.id}`);
}
