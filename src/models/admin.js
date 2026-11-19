import { withTransaction } from "../db/transaction.js";
import * as User from "./user.js";
import * as AuditLog from "./auditLog.js";

// Users are listed and changed one company at a time (ADR 0018): an owner sees and manages only their own company's
// people, and "the last owner" means the last owner of that company.
export async function listUsers(pool, companyId) {
    const { rows } = await pool.query(
        `SELECT users.id, users.email, roles.name AS role,
                to_char(users.created_at, 'YYYY-MM-DD') AS created
         FROM users JOIN roles ON roles.id = users.role_id
         WHERE users.company_id = $1
         ORDER BY users.id`,
        [companyId],
    );
    return rows;
}

export async function listRoles(pool) {
    const { rows } = await pool.query("SELECT name FROM roles ORDER BY id");
    return rows.map((row) => {
        return row.name;
    });
}

// An owner changes the login email of a user of their own company. Returns { ok: true } or { error } where error is one
// of: not_found (no such user, or one of another company), self (use the account page), no_login (a customer who signs
// in by link has no email) or taken. The password is not asked for, because it is someone else's login; the user keeps
// their password, and an email is not enough to take an account over while nothing sends a reset.
export async function changeEmail(pool, companyId, id, email, actingUserId) {
    // One transaction, so the change and its audit row stand or fall together.
    return withTransaction(pool, async (client) => {
        const { rows } = await client.query(
            "SELECT id, email, password_hash FROM users WHERE id = $1 AND company_id = $2 FOR UPDATE",
            [id, companyId],
        );

        if (!rows[0]) {
            return { error: "not_found" };
        }

        if (id === actingUserId) {
            return { error: "self" };
        }

        if (!rows[0].email || !rows[0].password_hash) {
            return { error: "no_login" };
        }

        const result = await User.setEmail(client, id, email);

        if (result === "taken") {
            return { error: "taken" };
        }

        await AuditLog.record(client, {
            companyId, actorId: actingUserId, action: "email_changed", targetId: id,
            details: { from: rows[0].email, to: email },
        });
        return { ok: result };
    });
}

// An owner makes a staff login in their own company. Returns the new user, or null when the email already has a login.
// The row in the audit log is written with it.
export async function createStaff(pool, companyId, actingUserId, { email, passwordHash, roleName }) {
    return withTransaction(pool, async (client) => {
        const user = await User.create(client, { email, passwordHash, roleName, companyId });

        if (!user) {
            return null;
        }

        await AuditLog.record(client, {
            companyId, actorId: actingUserId, action: "user_created", targetId: user.id,
            details: { email, role: roleName },
        });
        return user;
    });
}

// Returns { ok: true } or { error } where error is one of: not_found, self, no_login, role, last_owner.
// Every owner row of the company is locked first, so two owners cannot demote each other at the same moment. A user
// of another company is "not found", the same answer as a user that does not exist.
export async function changeRole(pool, companyId, id, roleName, actingUserId) {
    return withTransaction(pool, async (client) => {
        const owners = await client.query(
            `SELECT users.id FROM users JOIN roles ON roles.id = users.role_id
             WHERE roles.name = 'owner' AND users.company_id = $1 FOR UPDATE OF users`,
            [companyId],
        );
        const target = await client.query(
            `SELECT users.email, roles.name AS role FROM users JOIN roles ON roles.id = users.role_id
             WHERE users.id = $1 AND users.company_id = $2 FOR UPDATE OF users`,
            [id, companyId],
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
        await AuditLog.record(client, {
            companyId, actorId: actingUserId, action: "role_changed", targetId: id,
            details: { from: target.rows[0].role, to: roleName },
        });
        return { ok: true };
    });
}
