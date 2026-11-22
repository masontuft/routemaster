// Reads the shape of a schema and draws it as a Mermaid entity relationship diagram. The diagram in
// docs/architecture/database-erd.md is made by this code from the migrations, and tests/schemaDocs.test.js fails
// when the two drift apart, so the picture cannot go stale quietly. Run `pnpm erd` to rewrite it.

// Tables with no relationship to another table are left out, so bookkeeping tables such as
// `schema_migrations` do not clutter the picture.

const COLUMNS_SQL = `
    SELECT columns.table_name, columns.column_name, columns.udt_name, columns.is_nullable
    FROM information_schema.columns AS columns
    JOIN information_schema.tables AS tables
      ON tables.table_schema = columns.table_schema AND tables.table_name = columns.table_name
    WHERE columns.table_schema = current_schema() AND tables.table_type = 'BASE TABLE'
    ORDER BY columns.table_name, columns.ordinal_position`;

// kind is p (primary key), u (unique) or f (foreign key). columns are in the constraint's own order.
const CONSTRAINTS_SQL = `
    SELECT con.contype AS kind, con.conrelid::regclass::text AS child, con.confrelid::regclass::text AS parent,
           (SELECT array_agg(attribute.attname::text ORDER BY key.position)
              FROM unnest(con.conkey) WITH ORDINALITY AS key(number, position)
              JOIN pg_attribute AS attribute ON attribute.attrelid = con.conrelid AND attribute.attnum = key.number
           ) AS columns
    FROM pg_constraint AS con
    WHERE con.connamespace = current_schema()::regnamespace AND con.contype IN ('p', 'u', 'f')`;

// Returns { columns: [{ table, name, type, nullable }], constraints: [{ kind, child, parent, columns }] }.
// Works on the schema the pool's search_path points at.
export async function readSchema(pool) {
    const columns = await pool.query(COLUMNS_SQL);
    const constraints = await pool.query(CONSTRAINTS_SQL);

    return {
        columns: columns.rows.map((row) => {
            return {
                table: row.table_name,
                name: row.column_name,
                type: row.udt_name,
                nullable: row.is_nullable === "YES",
            };
        }),
        constraints: constraints.rows.map((row) => {
            return { kind: row.kind, child: row.child, parent: row.parent, columns: row.columns };
        }),
    };
}

// Plain character-code order, so the same schema gives the same text on every machine. The database's own
// ORDER BY follows its collation, which treats "_" differently from one install to the next.
function compareText(left, right) {
    if (left < right) {
        return -1;
    }
    return left > right ? 1 : 0;
}

function compareForeignKeys(left, right) {
    return compareText(left.child, right.child)
        || compareText(left.parent, right.parent)
        || compareText(left.columns.join(","), right.columns.join(","));
}

function sameColumns(left, right) {
    return left.length === right.length && left.every((name, index) => {
        return name === right[index];
    });
}

// "Exactly one" on the parent side when the key is required, "zero or one" when it can be null.
// "Zero or more" on the child side, or "zero or one" when the key columns are the child's whole unique key.
function relationshipLine(foreignKey, columnsByName, uniqueKeys) {
    const required = foreignKey.columns.every((name) => {
        return columnsByName.get(`${foreignKey.child}.${name}`).nullable === false;
    });
    const onlyOne = uniqueKeys.some((key) => {
        return key.child === foreignKey.child && sameColumns(key.columns, foreignKey.columns);
    });
    const parentSide = required ? "||" : "|o";
    const childSide = onlyOne ? "o|" : "o{";

    return `    ${foreignKey.parent} ${parentSide}--${childSide} ${foreignKey.child} : "${foreignKey.columns.join(", ")}"`;
}

function attributeLines(table, schema, keysByTable) {
    const keys = keysByTable.get(table);
    const lines = [];

    for (const column of schema.columns) {
        if (column.table !== table) {
            continue;
        }

        const marks = [];
        if (keys.primary.has(column.name)) {
            marks.push("PK");
        }
        if (keys.foreign.has(column.name)) {
            marks.push("FK");
        }
        if (marks.length === 0) {
            continue;
        }

        const note = keys.foreign.has(column.name) && column.nullable ? ' "nullable"' : "";
        lines.push(`        ${column.type} ${column.name} ${marks.join(", ")}${note}`);
    }

    return lines;
}

// Returns the diagram as text: `erDiagram`, one entity for each related table with its key columns,
// then one line for each foreign key. The order is fixed, so the same schema always gives the same text.
export function buildMermaid(schema) {
    const columnsByName = new Map(schema.columns.map((column) => {
        return [`${column.table}.${column.name}`, column];
    }));
    const foreignKeys = schema.constraints.filter((constraint) => {
        return constraint.kind === "f";
    }).sort(compareForeignKeys);
    const uniqueKeys = schema.constraints.filter((constraint) => {
        return constraint.kind === "u" || constraint.kind === "p";
    });

    const related = new Set();
    for (const foreignKey of foreignKeys) {
        related.add(foreignKey.child);
        related.add(foreignKey.parent);
    }

    const keysByTable = new Map();
    for (const table of related) {
        keysByTable.set(table, { primary: new Set(), foreign: new Set() });
    }
    for (const constraint of schema.constraints) {
        if (constraint.kind === "p" && related.has(constraint.child)) {
            constraint.columns.forEach((name) => {
                keysByTable.get(constraint.child).primary.add(name);
            });
        }
        if (constraint.kind === "f") {
            constraint.columns.forEach((name) => {
                keysByTable.get(constraint.child).foreign.add(name);
            });
        }
    }

    const lines = ["erDiagram"];

    for (const foreignKey of foreignKeys) {
        lines.push(relationshipLine(foreignKey, columnsByName, uniqueKeys));
    }

    for (const table of [...related].sort()) {
        lines.push(`    ${table} {`);
        lines.push(...attributeLines(table, schema, keysByTable));
        lines.push("    }");
    }

    return lines.join("\n");
}

export const ERD_START = "<!-- erd:start -->";
export const ERD_END = "<!-- erd:end -->";

// The text between the two markers in a Markdown file, without the code fence around it. Null if a marker is missing.
export function readDiagramBlock(markdown) {
    const start = markdown.indexOf(ERD_START);
    const end = markdown.indexOf(ERD_END);

    if (start === -1 || end === -1 || end < start) {
        return null;
    }

    const block = markdown.slice(start + ERD_START.length, end).trim();
    const match = /^```mermaid\n([\s\S]*)\n```$/.exec(block);
    return match ? match[1] : null;
}

// The Markdown with the diagram between the markers replaced. Null if a marker is missing.
export function writeDiagramBlock(markdown, diagram) {
    const start = markdown.indexOf(ERD_START);
    const end = markdown.indexOf(ERD_END);

    if (start === -1 || end === -1 || end < start) {
        return null;
    }

    return `${markdown.slice(0, start + ERD_START.length)}\n\`\`\`mermaid\n${diagram}\n\`\`\`\n${markdown.slice(end)}`;
}
