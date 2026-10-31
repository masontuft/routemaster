const UNIQUE_VIOLATION = "23505";

const SELECT_USER = `
    SELECT users.id, users.email, users.password_hash, roles.name AS role
    FROM users
    JOIN roles ON roles.id = users.role_id
`;

export async function findByEmail(pool, email) {
    const { rows } = await pool.query(`${SELECT_USER} WHERE users.email = $1`, [email]);
    return rows[0] ?? null;
}

// Returns the new user, or null when the email is already registered.
export async function create(pool, { email, passwordHash, roleName }) {
    try {
        const { rows } = await pool.query(
            `INSERT INTO users (email, password_hash, role_id)
             SELECT $1, $2, id FROM roles WHERE name = $3
             RETURNING id`,
            [email, passwordHash, roleName],
        );

        if (rows.length === 0) {
            throw new Error(`Unknown role: ${roleName}`);
        }

        return { id: rows[0].id, email, role: roleName };
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) {
            return null;
        }

        throw error;
    }
}
