import * as Customer from "../models/customer.js";

// Puts the logged-in customer's id on the session, creating the customer record on first use.
export default async function ensureCustomer(req, res, next) {
    const user = req.session.user;

    if (!user.customerId) {
        user.customerId = await Customer.ensureForUser(req.app.locals.db, user);
    }

    next();
}
