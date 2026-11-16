import { personKey } from "../utils/personName.js";
import { withTransaction } from "./transaction.js";

const EXAMPLE_LIMIT = 10;

async function findChanges(db) {
    const { rows } = await db.query("SELECT id, name, name_normalized FROM customers ORDER BY id");
    const changes = [];

    for (const row of rows) {
        const key = personKey(row.name);
        if (key !== row.name_normalized) {
            changes.push({ id: row.id, name: row.name, from: row.name_normalized, to: key });
        }
    }

    return { total: rows.length, changes };
}

// Recomputes customers.name_normalized with the person-name rules, for customers saved under the old rules.
// Only that column changes. A dry run (apply false) reads and writes nothing. An apply locks the customers table
// first, so a customer saved while it runs cannot keep an old key, and writes every change in one statement.
// Returns { total, changed, applied, examples }.
export async function renormalizeCustomerNames(pool, { apply = false } = {}) {
    if (apply === false) {
        const { total, changes } = await findChanges(pool);
        return { total, changed: changes.length, applied: false, examples: changes.slice(0, EXAMPLE_LIMIT) };
    }

    return withTransaction(pool, async (client) => {
        await client.query("LOCK TABLE customers IN SHARE ROW EXCLUSIVE MODE");
        const { total, changes } = await findChanges(client);

        if (changes.length > 0) {
            await client.query(
                `UPDATE customers SET name_normalized = wanted.key
                 FROM unnest($1::int[], $2::text[]) AS wanted(id, key)
                 WHERE customers.id = wanted.id`,
                [
                    changes.map((change) => {
                        return change.id;
                    }),
                    changes.map((change) => {
                        return change.to;
                    }),
                ],
            );
        }

        return { total, changed: changes.length, applied: true, examples: changes.slice(0, EXAMPLE_LIMIT) };
    });
}
