import { withTransaction } from "../db/transaction.js";

// A company is one business using Routemaster (ADR 0018). These are the reads the public pages need and the one place a
// company is made.

const UNIQUE_VIOLATION = "23505";

export async function findBySlug(pool, slug) {
    const { rows } = await pool.query("SELECT id, name, slug FROM companies WHERE slug = $1", [String(slug)]);
    return rows[0] ?? null;
}

export async function findById(pool, id) {
    const { rows } = await pool.query("SELECT id, name, slug FROM companies WHERE id = $1", [id]);
    return rows[0] ?? null;
}

// Whether the slug and the owner's email are already used, for a dry run. A race with another creation is still caught
// by createWithOwner, so this is a courtesy and not a lock.
export async function availability(pool, { slug, ownerEmail }) {
    const company = await pool.query("SELECT 1 FROM companies WHERE slug = $1", [slug]);
    const user = await pool.query("SELECT 1 FROM users WHERE email = $1", [ownerEmail]);
    return { slugTaken: company.rowCount > 0, emailTaken: user.rowCount > 0 };
}

// Makes a company, its owner login and its service types in one transaction, so a failure leaves nothing behind. The
// values are already validated (src/utils/companyInput.js) and the password is already hashed. Returns
// { companyId, ownerId, serviceIds } or { error } where error is slug_taken or email_taken. The owner belongs to the
// new company and no other. Any other failure is thrown.
export async function createWithOwner(pool, { name, slug, ownerEmail, ownerPasswordHash, services = [] }) {
    try {
        return await withTransaction(pool, async (client) => {
            const company = await client.query(
                "INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING id",
                [name, slug],
            );
            const companyId = company.rows[0].id;
            const owner = await client.query(
                `INSERT INTO users (email, password_hash, role_id, company_id)
                 SELECT $1, $2, id, $3 FROM roles WHERE name = 'owner' RETURNING id`,
                [ownerEmail, ownerPasswordHash, companyId],
            );

            if (owner.rowCount === 0) {
                throw new Error("There is no owner role.");
            }

            const serviceIds = [];

            for (const service of services) {
                const made = await client.query(
                    "INSERT INTO service_types (name, price_cents, active, company_id) VALUES ($1, $2, true, $3) RETURNING id",
                    [service.name, service.priceCents, companyId],
                );
                serviceIds.push(made.rows[0].id);
            }

            return { companyId, ownerId: owner.rows[0].id, serviceIds };
        });
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION && error.constraint === "companies_slug_key") {
            return { error: "slug_taken" };
        }

        if (error.code === UNIQUE_VIOLATION && error.constraint === "users_email_key") {
            return { error: "email_taken" };
        }

        throw error;
    }
}
