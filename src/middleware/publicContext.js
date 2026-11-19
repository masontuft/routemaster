import * as Company from "../models/company.js";
import { basePathFor } from "../utils/company.js";
import { DEFAULT_COMPANY_ID } from "../config/company.js";

// Tells every page which company's public pages its links should point at, and whose name the header shows:
// res.locals.company and res.locals.base. A visitor on a bare page gets the plain site (no company, base ""). A
// logged-in user of another company than the first gets their own company, so the header and the public links on a
// staff page lead to their company's pages and not to the first company's. A page under /w/<slug> overrides this in
// companyFromSlug.
export default async function publicContext(req, res, next) {
    res.locals.company = null;
    res.locals.base = "";
    const user = req.session?.user;

    if (user && Number.isInteger(user.companyId) && user.companyId !== DEFAULT_COMPANY_ID) {
        const company = await Company.findById(req.app.locals.db, user.companyId);

        if (company) {
            res.locals.company = company;
            res.locals.base = basePathFor(company);
        }
    }

    next();
}
