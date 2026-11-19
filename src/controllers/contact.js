import * as ContactMessage from "../models/contactMessage.js";
import { validateContact } from "../utils/validation.js";
import { DEFAULT_COMPANY_ID } from "../config/company.js";

const EMPTY = { name: "", email: "", phone: "", message: "" };

export function showForm(req, res) {
    res.render("contact/form", { title: "Contact Us", pageStyle: "marketing", errors: [], values: EMPTY });
}

export async function submit(req, res) {
    const { values, errors } = validateContact(req.body);

    if (errors.length) {
        return res.status(400).render("contact/form", { title: "Contact Us", pageStyle: "marketing", errors, values });
    }

    // /contact has no company in its address yet, so a message goes to the first company (see config/company.js).
    await ContactMessage.create(req.app.locals.db, DEFAULT_COMPANY_ID, values);
    res.render("contact/thanks", { title: "Message Sent", pageStyle: "marketing" });
}
