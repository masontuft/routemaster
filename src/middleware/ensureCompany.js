// Puts the company on the session of a logged-in user who does not have one. Sessions that were already open when
// companies were added (ADR 0018) were saved without it, and without this those people would be logged out or, worse,
// see nothing. The company is read from the users row, once, and the session keeps it.
// If the user row is gone, the company stays unset and companyOf() throws. It does not fall back to company 1.
export default async function ensureCompany(req, res, next) {
    const user = req.session?.user;

    if (user && !Number.isInteger(user.companyId)) {
        const { rows } = await req.app.locals.db.query("SELECT company_id FROM users WHERE id = $1", [user.id]);

        if (rows[0]) {
            user.companyId = rows[0].company_id;
        }
    }

    next();
}
