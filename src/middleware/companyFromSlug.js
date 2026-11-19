import * as Company from "../models/company.js";
import { notFound } from "../utils/errors.js";

// For a page under /w/<slug>: finds the company the slug names and puts it on the request, so the page is that
// company's. An unknown slug is a plain 404, the same page as any other missing address. The slug is looked up exactly
// as written, so /w/ACME is not /w/acme. Pages under this slug keep their links under it (res.locals.base).
export default async function companyFromSlug(req, res, next) {
    const company = await Company.findBySlug(req.app.locals.db, req.params.slug);

    if (!company) {
        return next(notFound());
    }

    req.company = company;
    res.locals.company = company;
    res.locals.base = `/w/${company.slug}`;
    next();
}
