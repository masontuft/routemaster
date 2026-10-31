import { createPool } from "../src/db/pool.js";
import * as User from "../src/models/user.js";
import { hashPassword } from "../src/utils/password.js";

const url = process.env.DATABASE_URL;
const password = process.env.SEED_PASSWORD;

if (!url || !password) {
    console.error("DATABASE_URL and SEED_PASSWORD must be set.");
    process.exit(1);
}

const accounts = [
    { email: "owner@example.com", roleName: "owner" },
    { email: "dispatcher@example.com", roleName: "dispatcher" },
    { email: "customer@example.com", roleName: "customer" },
];

const pool = createPool(url);

try {
    const passwordHash = await hashPassword(password);

    for (const account of accounts) {
        const created = await User.create(pool, { ...account, passwordHash });
        console.log(`${account.email}: ${created ? "created" : "already exists"}`);
    }
} finally {
    await pool.end();
}
