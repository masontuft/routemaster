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
