import * as Property from "../models/property.js";
import { validateProperty } from "../utils/validation.js";

export function showNew(req, res) {
    res.render("properties/new", { title: "Add Property", errors: [], values: {} });
}

export async function create(req, res) {
    const { values, errors } = validateProperty(req.body);

    if (errors.length) {
        return res.status(400).render("properties/new", { title: "Add Property", errors, values });
    }

    await Property.create(req.app.locals.db, req.session.user.customerId, values);
    res.redirect("/requests/new");
}
