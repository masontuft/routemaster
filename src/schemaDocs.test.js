import { test, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testDb } from "./test/db.js";
import { buildMermaid, readDiagramBlock, readSchema, writeDiagramBlock } from "./db/erd.js";

// The schema docs must say what the migrations build. Two checks: the column lists in the schema reference, and the
// diagram in database-erd.md. When one fails, the schema changed and the doc did not.

const docs = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "architecture");
const db = testDb("schemadocs");

before(() => {
    return db.reset();
});
after(() => {
    return db.close();
});

function column(table, name, nullable = false, type = "int4") {
    return { table, name, type, nullable };
}

const FAKE = {
    columns: [
        column("users", "id"),
        column("customers", "id"),
        column("customers", "user_id", true),
        column("properties", "id"),
        column("properties", "customer_id"),
        column("lonely", "id"),
    ],
    constraints: [
        { kind: "p", child: "users", parent: null, columns: ["id"] },
        { kind: "p", child: "customers", parent: null, columns: ["id"] },
        { kind: "p", child: "properties", parent: null, columns: ["id"] },
        { kind: "p", child: "lonely", parent: null, columns: ["id"] },
        { kind: "u", child: "customers", parent: null, columns: ["user_id"] },
        { kind: "f", child: "customers", parent: "users", columns: ["user_id"] },
        { kind: "f", child: "properties", parent: "customers", columns: ["customer_id"] },
    ],
};

test("a required key is exactly one to many, and a nullable unique key is zero or one to zero or one", () => {
    const text = buildMermaid(FAKE);

    assert.match(text, /^erDiagram\n/);
    assert.ok(text.includes('    customers ||--o{ properties : "customer_id"'));
    assert.ok(text.includes('    users |o--o| customers : "user_id"'));
});

test("an entity lists only its key columns, and says when a foreign key can be null", () => {
    const text = buildMermaid(FAKE);

    assert.ok(text.includes('    customers {\n        int4 id PK\n        int4 user_id FK "nullable"\n    }'));
    assert.ok(text.includes("    properties {\n        int4 id PK\n        int4 customer_id FK\n    }"));
});

test("a table with no relationship is left out, and the same schema always gives the same text", () => {
    const text = buildMermaid(FAKE);

    assert.strictEqual(text.includes("lonely"), false);
    assert.strictEqual(buildMermaid(FAKE), text);
});

test("the diagram block is read from, and written between, the markers", () => {
    const page = "# Title\n<!-- erd:start -->\n<!-- erd:end -->\nafter\n";
    const written = writeDiagramBlock(page, "erDiagram\n    a ||--o{ b : \"a_id\"");

    assert.strictEqual(readDiagramBlock(written), "erDiagram\n    a ||--o{ b : \"a_id\"");
    assert.ok(written.startsWith("# Title\n"));
    assert.ok(written.endsWith("<!-- erd:end -->\nafter\n"));
    assert.strictEqual(writeDiagramBlock("no markers", "x"), null);
    assert.strictEqual(readDiagramBlock("no markers"), null);
});

test("database-erd.md shows the schema the migrations build", async () => {
    const page = fs.readFileSync(path.join(docs, "database-erd.md"), "utf8");
    const expected = buildMermaid(await readSchema(db.pool));

    assert.strictEqual(
        readDiagramBlock(page),
        expected,
        "database-erd.md is out of date with the migrations. Run `pnpm erd` and commit the result.",
    );
});

// Reads `## Table \`name\`` sections and their `| \`column\` | \`type\` | constraints |` rows.
function documentedColumns() {
    const tables = new Map();
    let current = null;

    for (const line of fs.readFileSync(path.join(docs, "RouteMaster-Database-Schema.md"), "utf8").split("\n")) {
        const table = /^## Table `([^`]+)`/.exec(line);
        if (table) {
            current = new Map();
            tables.set(table[1], current);
            continue;
        }

        const row = /^\| `([^`]+)` \| `([^`]+)` \|(.*)\|$/.exec(line);
        if (current && row) {
            current.set(row[1], { type: row[2], nullable: /Nullable/.test(row[3]) });
        }
    }

    return tables;
}

test("the schema reference lists every table and column with its type and nullability", async () => {
    const schema = await readSchema(db.pool);
    const documented = documentedColumns();
    const problems = [];

    const actual = new Map();
    for (const entry of schema.columns) {
        const columns = actual.get(entry.table) ?? new Map();
        columns.set(entry.name, entry);
        actual.set(entry.table, columns);
    }

    for (const [table, columns] of actual) {
        if (documented.has(table) === false) {
            problems.push(`table ${table} is missing from the schema reference`);
            continue;
        }

        for (const [name, entry] of columns) {
            const found = documented.get(table).get(name);
            if (found === undefined) {
                problems.push(`${table}.${name} is missing from the schema reference`);
            } else if (found.type !== entry.type || found.nullable !== entry.nullable) {
                problems.push(`${table}.${name} differs: the database has ${entry.type}${entry.nullable ? " nullable" : ""}`);
            }
        }

        for (const name of documented.get(table).keys()) {
            if (columns.has(name) === false) {
                problems.push(`${table}.${name} is in the schema reference but not in the database`);
            }
        }
    }

    for (const table of documented.keys()) {
        if (actual.has(table) === false) {
            problems.push(`table ${table} is in the schema reference but not in the database`);
        }
    }

    assert.deepStrictEqual(problems, [], "RouteMaster-Database-Schema.md is out of date with the migrations.");
});

test("the diagram does not depend on the order the database returned the keys in", () => {
    const shuffled = {
        columns: [...FAKE.columns].reverse(),
        constraints: [...FAKE.constraints].reverse(),
    };

    assert.strictEqual(buildMermaid(shuffled), buildMermaid(FAKE));
});

test("names are ordered by character code, so an underscore sorts before a letter on every machine", () => {
    const schema = {
        columns: [
            column("parent", "id"),
            column("batch_items", "id"), column("batch_items", "parent_id"),
            column("batches", "id"), column("batches", "parent_id"),
        ],
        constraints: [
            { kind: "p", child: "parent", parent: null, columns: ["id"] },
            { kind: "p", child: "batch_items", parent: null, columns: ["id"] },
            { kind: "p", child: "batches", parent: null, columns: ["id"] },
            { kind: "f", child: "batches", parent: "parent", columns: ["parent_id"] },
            { kind: "f", child: "batch_items", parent: "parent", columns: ["parent_id"] },
        ],
    };
    const text = buildMermaid(schema);

    assert.ok(text.indexOf("parent ||--o{ batch_items") < text.indexOf("parent ||--o{ batches"));
    assert.ok(text.indexOf("    batch_items {") < text.indexOf("    batches {"));
});
