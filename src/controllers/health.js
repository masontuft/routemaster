// Render uses this to decide whether the service is up, so it checks the database too.
// With no pool there is nothing to check (tests build the app that way).
export async function check(req, res) {
    const pool = req.app.locals.db;

    if (pool) {
        try {
            await pool.query("SELECT 1");
        } catch (error) {
            console.error("Health check failed:", error.message);
            return res.status(503).send("database unavailable");
        }
    }

    res.status(200).send("ok");
}
