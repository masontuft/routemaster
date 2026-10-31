import { createPool } from "../src/db/pool.js";
import * as AccessLink from "../src/models/accessLink.js";
import * as Customer from "../src/models/customer.js";
import * as User from "../src/models/user.js";

const target = process.argv[2];
const url = process.env.DATABASE_URL;

if (!target || !url) {
    console.error("Usage: pnpm link:create <customer id or user email>   (DATABASE_URL must be set)");
    process.exit(1);
}

const pool = createPool(url);

try {
    let customerId = /^\d+$/.test(target) ? Number(target) : null;

    if (!customerId) {
        const user = await User.findByEmail(pool, target.toLowerCase());
        customerId = user ? await Customer.ensureForUser(pool, user) : null;
    }

    if (!customerId || !await Customer.findById(pool, customerId)) {
        console.error("No such customer or user.");
        process.exitCode = 1;
    } else {
        const token = await AccessLink.create(pool, { customerId });
        const base = process.env.BASE_URL ?? "http://localhost:3000";
        console.log(`${base}/l/${token}`);
    }
} finally {
    await pool.end();
}
