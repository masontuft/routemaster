import { withTransaction } from "../db/transaction.js";

export async function listUsers(pool) {
    const { rows } = await pool.query(
        `SELECT users.id, users.email, roles.name AS role,
                to_char(users.created_at, 'YYYY-MM-DD') AS created
         FROM users JOIN roles ON roles.id = users.role_id
         ORDER BY users.id`,
    );
    return rows;
}

export async function listRoles(pool) {
    const { rows } = await pool.query("SELECT name FROM roles ORDER BY id");
    return rows.map((row) => {
        return row.name;
    });
}

// Returns { ok: true } or { error } where error is one of: not_found, self, no_login, role, last_owner.
// Every owner row is locked first, so two owners cannot demote each other at the same moment.
export async function changeRole(pool, id, roleName, actingUserId) {
    return withTransaction(pool, async (client) => {
        const owners = await client.query(
            "SELECT users.id FROM users JOIN roles ON roles.id = users.role_id WHERE roles.name = 'owner' FOR UPDATE OF users",
        );
        const target = await client.query(
            `SELECT users.email, roles.name AS role FROM users JOIN roles ON roles.id = users.role_id
             WHERE users.id = $1 FOR UPDATE OF users`,
            [id],
        );

        if (!target.rows[0]) {
            return { error: "not_found" };
        }

        if (id === actingUserId) {
            return { error: "self" };
        }

        // A link-only customer has no email or password, so a staff role would be a login nobody can use.
        if (!target.rows[0].email) {
            return { error: "no_login" };
        }

        const role = await client.query("SELECT id FROM roles WHERE name = $1", [roleName]);

        if (!role.rows[0]) {
            return { error: "role" };
        }

        if (target.rows[0].role === "owner" && roleName !== "owner" && owners.rowCount <= 1) {
            return { error: "last_owner" };
        }

        await client.query("UPDATE users SET role_id = $2 WHERE id = $1", [id, role.rows[0].id]);
        return { ok: true };
    });
}
