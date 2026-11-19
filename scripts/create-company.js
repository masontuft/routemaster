import { createPool } from "../src/db/pool.js";
import { createCompany } from "../src/db/createCompany.js";

// Makes a company with its owner and service types (ADR 0018):
//   OWNER_PASSWORD=... pnpm company:create --name "Acme Lawn" --slug acme-lawn --owner-email owner@example.com
// It writes to the database named by DATABASE_URL, which is production on Mason's machine, so run it with --dry-run
// first.
const url = process.env.DATABASE_URL;

if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
}

const pool = createPool(url);

try {
    const { exitCode, lines } = await createCompany({
        argv: process.argv.slice(2),
        env: process.env,
        pool,
        baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
    });
    console.log(lines.join("\n"));
    process.exitCode = exitCode;
} finally {
    await pool.end();
}
