// Recomputes customers.name_normalized with the person-name rules (docs/adr/0016-name-normalization.md).
//   pnpm names:renormalize              dry run: says how many keys would change and shows examples, writes nothing
//   pnpm names:renormalize --dry-run    the same
//   pnpm names:renormalize --apply      writes the new keys in one transaction
// Run it right after the code that uses the new rules is deployed. It prints customer names, so keep the output
// out of commits and tickets.
import { createStartupPool } from "../src/db/pool.js";
import { renormalizeCustomerNames } from "../src/db/renormalizeNames.js";

const url = process.env.DATABASE_URL;
const flags = process.argv.slice(2);
const apply = flags.includes("--apply");

if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
}

if (flags.some((flag) => {
    return flag !== "--apply" && flag !== "--dry-run";
}) || (apply && flags.includes("--dry-run"))) {
    console.error("Use --dry-run (the default) or --apply, not both.");
    process.exit(1);
}

const pool = createStartupPool(url);

try {
    const result = await renormalizeCustomerNames(pool, { apply });
    console.log(`${result.applied ? "Updated" : "Would update"} ${result.changed} of ${result.total} customers.`);

    for (const change of result.examples) {
        console.log(`  #${change.id} "${change.name}": ${change.from} -> ${change.to}`);
    }

    if (result.applied === false && result.changed > 0) {
        console.log("Nothing was written. Run again with --apply to write these keys.");
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
