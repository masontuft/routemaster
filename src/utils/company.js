import { DEFAULT_COMPANY_ID } from "../config/company.js";

// The company the logged-in user belongs to. It comes from the session, never from a form field or a URL.
// Throws when it is missing instead of falling back to company 1: a staff page that quietly showed an empty list
// would look like lost data, and a fallback would show one company another's rows.
export function companyOf(req) {
    const companyId = req.session?.user?.companyId;

    if (!Number.isInteger(companyId)) {
        throw new Error("The session has no company.");
    }

    return companyId;
}

// The company a public page is for (ADR 0018). A page under /w/<slug> has the company that slug names, set by
// src/middleware/companyFromSlug.js. A bare public page such as /services belongs to the first company. This is the
// one place that fallback is allowed: a logged-in page uses companyOf, which never falls back.
export function publicCompanyId(req) {
    return req.company?.id ?? DEFAULT_COMPANY_ID;
}

// The prefix of a company's public pages, "" for the first company's bare pages. Used for links in a page that is not
// itself under /w/<slug>, such as a logged-in staff page or an expired link.
export function basePathFor(company) {
    return !company || company.id === DEFAULT_COMPANY_ID ? "" : `/w/${company.slug}`;
}

// Where a user lands after logging in or registering: their company's home page.
export function companyHomePath(company) {
    return basePathFor(company) || "/";
}
