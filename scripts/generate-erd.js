// Rewrites the diagram in docs/architecture/database-erd.md from the migrations.
//   pnpm erd
// It migrates a throwaway schema inside the database named by TEST_DATABASE_URL (never DATABASE_URL), reads its
// tables, keys and foreign keys, and replaces the diagram between the erd:start and erd:end markers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMermaid, readSchema, writeDiagramBlock } from "../src/db/erd.js";
import { testDb } from "../src/test/db.js";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "architecture", "database-erd.md");
const db = testDb("erdgenerate");

try {
    await db.reset();
    const diagram = buildMermaid(await readSchema(db.pool));
    const updated = writeDiagramBlock(fs.readFileSync(file, "utf8"), diagram);

    if (updated === null) {
        throw new Error(`${file} has no erd:start and erd:end markers.`);
    }

    fs.writeFileSync(file, updated);
    console.log(`Updated the diagram in ${path.relative(process.cwd(), file)}.`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await db.close();
}
