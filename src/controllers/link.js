import * as AccessLink from "../models/accessLink.js";
import * as Customer from "../models/customer.js";
import { regenerateSession } from "../utils/session.js";

function invalid(res) {
    return res.status(404).render("link/invalid", { title: "Link Not Valid" });
}

// A GET never logs anyone in: email scanners open links, so only the button's POST redeems.
export async function showContinue(req, res) {
    const link = await AccessLink.findValid(req.app.locals.db, req.params.token);
    return link ? res.render("link/continue", { title: "Continue", token: req.params.token }) : invalid(res);
}

export async function redeem(req, res) {
    const db = req.app.locals.db;
    const link = await AccessLink.findValid(db, req.params.token);
    const user = link && await Customer.ensureUser(db, link.customerId);

    if (!user) {
        return invalid(res);
    }

    await regenerateSession(req);
    req.session.user = {
        id: user.id, email: null, role: "customer", displayName: user.displayName,
        customerId: link.customerId, via: "link",
    };
    res.redirect("/requests");
}
