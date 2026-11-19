// The audit log (migration 034): a row for each sensitive change to a login. record() takes a transaction client, so
// the row is written in the same transaction as the change and the two stand or fall together.

export const ACTIONS = ["email_changed", "password_changed", "role_changed", "user_created"];

// details is small and about the change in words that outlive the user. Never a password or a hash.
export async function record(client, { companyId, actorId, action, targetId = null, details = {} }) {
    if (!ACTIONS.includes(action)) {
        throw new RangeError(`Unknown audit action: ${action}`);
    }

    await client.query(
        "INSERT INTO audit_log (company_id, actor_id, action, target_id, details) VALUES ($1, $2, $3, $4, $5)",
        [companyId, actorId ?? null, action, targetId, JSON.stringify(details)],
    );
}

// What an entry says, as a sentence fragment for the page.
export function describe(action, details) {
    switch (action) {
        case "email_changed":
            return `changed an email from ${details.from} to ${details.to}`;
        case "password_changed":
            return "changed a password";
        case "role_changed":
            return `changed a role from ${details.from} to ${details.to}`;
        case "user_created":
            return `created a ${details.role} login for ${details.email}`;
        default:
            return action;
    }
}

// The newest entries of one company. A user who has since been deleted shows as null.
export async function list(pool, companyId, limit = 200) {
    const { rows } = await pool.query(
        `SELECT audit_log.id, audit_log.action, audit_log.details,
                to_char(audit_log.created_at, 'YYYY-MM-DD HH24:MI') AS at,
                actor.email AS actor_email, target.email AS target_email
         FROM audit_log
         LEFT JOIN users AS actor ON actor.id = audit_log.actor_id
         LEFT JOIN users AS target ON target.id = audit_log.target_id
         WHERE audit_log.company_id = $1
         ORDER BY audit_log.id DESC
         LIMIT $2`,
        [companyId, limit],
    );

    return rows.map((row) => {
        return { ...row, summary: describe(row.action, row.details) };
    });
}
