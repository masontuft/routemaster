import { normalizePhone, normalizeAddress } from "../utils/normalize.js";
import { personKey } from "../utils/personName.js";

// A lead is someone who asked for service on the public form and is not a customer yet (migration 025).
// All three functions take a pool or a transaction client, because staff convert a lead inside a transaction.

// Finds the lead with this name, phone and street, or makes one. ON CONFLICT is what keeps two visitors who submit
// the same details at the same moment from making two leads: the loser of the race updates the winner's row to
// itself, which makes RETURNING hand back its id. Returns the lead id.
export async function findOrCreate(db, { name, phone, address }) {
    const { rows } = await db.query(
        `INSERT INTO leads (name, name_normalized, phone, phone_normalized, address, address_normalized)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name_normalized, phone_normalized, address_normalized) DO UPDATE SET name = leads.name
         RETURNING id`,
        [name, personKey(name), phone, normalizePhone(phone), address, normalizeAddress(address)],
    );
    return rows[0].id;
}

export async function findById(db, id) {
    const { rows } = await db.query(
        "SELECT id, name, phone, address, customer_id FROM leads WHERE id = $1",
        [id],
    );
    return rows[0] ?? null;
}

// Records which customer the lead became. Only a lead that has not been converted changes, so a second call cannot
// point a converted lead at a different customer. Returns true when this call converted it.
export async function markConverted(db, id, customerId) {
    const result = await db.query(
        "UPDATE leads SET customer_id = $2 WHERE id = $1 AND customer_id IS NULL",
        [id, customerId],
    );
    return result.rowCount === 1;
}
