const UNIQUE_VIOLATION = "23505";

const SELECT_USER = `
    SELECT users.id, users.email, users.password_hash, users.company_id AS "companyId", roles.name AS role
    FROM users
    JOIN roles ON roles.id = users.role_id
`;

export async function findById(pool, id) {
    const { rows } = await pool.query(`${SELECT_USER} WHERE users.id = $1`, [id]);
    return rows[0] ?? null;
}

export async function findByIdForUpdate(client, id) {
    const { rows } = await client.query(`${SELECT_USER} WHERE users.id = $1 FOR UPDATE OF users`, [id]);
    return rows[0] ?? null;
}

// Changes a login's email. The email is already validated and lower-cased. Returns true, false for a user that does not
// exist, or "taken" when another login, in any company, has it: an email is one login in one company.
export async function setEmail(pool, id, email) {
    try {
        const result = await pool.query("UPDATE users SET email = $2 WHERE id = $1", [id, email]);
        return result.rowCount === 1;
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION && error.constraint === "users_email_key") {
            return "taken";
        }

        throw error;
    }
}

// Replaces a user's password hash. Returns false for a user that does not exist.
export async function setPasswordHash(pool, id, passwordHash) {
    const result = await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [id, passwordHash]);
    return result.rowCount === 1;
}

// Ends every session of the user except the one named, or all of them when keepSid is omitted. A session is a row of
// the session table whose data holds the user id. Returns how many it ended.
export async function endOtherSessions(pool, id, keepSid = null) {
    const result = keepSid
        ? await pool.query(
            `DELETE FROM "session" WHERE sess->'user'->>'id' = $1 AND sid <> $2`,
            [String(id), keepSid],
        )
        : await pool.query(`DELETE FROM "session" WHERE sess->'user'->>'id' = $1`, [String(id)]);

    return result.rowCount;
}

export async function findByEmail(pool, email) {
    const { rows } = await pool.query(`${SELECT_USER} WHERE users.email = $1`, [email]);
    return rows[0] ?? null;
}

// Returns the new user, or null when the email is already registered. companyId is required: a user belongs to
// one company (ADR 0018), and an undefined one is sent as NULL, which the column refuses.
export async function create(pool, { email, passwordHash, roleName, companyId }) {
    try {
        const { rows } = await pool.query(
            `INSERT INTO users (email, password_hash, role_id, company_id)
             SELECT $1, $2, id, $4 FROM roles WHERE name = $3
             RETURNING id`,
            [email, passwordHash, roleName, companyId],
        );

        if (rows.length === 0) {
            throw new Error(`Unknown role: ${roleName}`);
        }

        return { id: rows[0].id, email, role: roleName, companyId };
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) {
            return null;
        }

        throw error;
    }
}
