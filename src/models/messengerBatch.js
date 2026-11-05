import { withTransaction } from "../db/transaction.js";
import { normalizePhone } from "../utils/normalize.js";
import { generateToken, hashToken } from "../utils/token.js";
import * as AccessLink from "./accessLink.js";

export const MAX_BATCH = 500;
export const FETCH_MINUTES = 60;
export const RESULTS_HOURS = 24;
export const STATUSES = ["sent", "failed", "skipped"];

// A phone is usable when it has at least 10 digits, the same rule the link batches use.
function hasUsablePhone(phone) {
    return normalizePhone(phone).length >= 10;
}

// Messenger gets E.164, which a phone's messaging app accepts. A 10-digit number is a US number.
function toE164(phone) {
    const digits = normalizePhone(phone);
    return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

// One pass with a function, so a name that contains "{link}" or "$&" is inserted as plain text and never expanded.
function messageFor(template, name, link) {
    return template.replace(/\{(name|link)\}/g, (match, key) => {
        return key === "name" ? name : link;
    });
}

// Stages a batch for the ticked customers. No magic link is made yet: links are minted when Messenger fetches, so a
// batch nobody opens leaves no live link behind. The raw batch token is returned here and nowhere else.
// Customers without a usable phone, and ids that are not customers, are left out and counted.
export async function stage(pool, { createdBy, customerIds, messageTemplate, days }) {
    const ids = [...new Set(customerIds)];

    return withTransaction(pool, async (client) => {
        const { rows } = await client.query(
            "SELECT id, phone FROM customers WHERE id = ANY($1::int[]) ORDER BY id",
            [ids],
        );
        const eligible = rows.filter((customer) => {
            return hasUsablePhone(customer.phone);
        });

        if (eligible.length === 0) {
            return { error: "empty", noPhone: ids.length };
        }

        if (eligible.length > MAX_BATCH) {
            return { error: "too_many", count: eligible.length };
        }

        const token = generateToken();
        const batch = await client.query(
            `INSERT INTO messenger_batches
                 (created_by, token_hash, message_template, link_days, fetch_expires_at, results_expires_at)
             VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5), now() + make_interval(hours => $6))
             RETURNING id`,
            [createdBy ?? null, hashToken(token), messageTemplate, days, FETCH_MINUTES, RESULTS_HOURS],
        );
        const batchId = batch.rows[0].id;

        await client.query(
            `INSERT INTO messenger_batch_recipients (batch_id, customer_id)
             SELECT $1, unnest($2::int[])`,
            [batchId, eligible.map((customer) => {
                return customer.id;
            })],
        );

        return { batchId, token, staged: eligible.length, noPhone: ids.length - eligible.length };
    });
}

// What Messenger fetches. Each recipient carries the finished message and its parts (the template is on the batch, the
// link on the recipient), so the app can let the dispatcher edit the wording and rebuild every message. Mints a fresh
// magic link for each customer not yet marked sent, and revokes the link an earlier fetch made for them, so a retry
// after a dropped connection leaves one working link each and nobody already texted is texted again. The batch row is
// locked so two fetches cannot interleave. Unknown, expired and wrong tokens all give the same not_found. origin is
// the site's address, such as https://example.com, with no trailing slash.
export async function fetchBatch(pool, token, origin) {
    return withTransaction(pool, async (client) => {
        const found = await client.query(
            `SELECT id, message_template, link_days, created_by, fetch_expires_at
             FROM messenger_batches
             WHERE token_hash = $1 AND fetch_expires_at > now()
             FOR UPDATE`,
            [hashToken(String(token))],
        );

        if (found.rows.length === 0) {
            return { error: "not_found" };
        }

        const batch = found.rows[0];
        const { rows: pending } = await client.query(
            `SELECT recipients.id, recipients.access_link_id, customers.id AS customer_id, customers.name, customers.phone
             FROM messenger_batch_recipients AS recipients
             JOIN customers ON customers.id = recipients.customer_id
             WHERE recipients.batch_id = $1 AND recipients.status <> 'sent'
             ORDER BY customers.name, customers.id`,
            [batch.id],
        );
        const recipients = [];

        for (const row of pending) {
            if (row.access_link_id !== null) {
                await AccessLink.revoke(client, row.access_link_id);
            }

            const link = await AccessLink.createWithId(client, {
                customerId: row.customer_id, createdBy: batch.created_by, days: batch.link_days,
            });
            await client.query("UPDATE messenger_batch_recipients SET access_link_id = $2 WHERE id = $1", [row.id, link.id]);
            const url = `${origin}/l/${link.token}`;
            recipients.push({
                recipientId: row.id,
                customerName: row.name,
                phone: toE164(row.phone),
                link: url,
                message: messageFor(batch.message_template, row.name, url),
            });
        }

        await client.query("UPDATE messenger_batches SET fetched_at = COALESCE(fetched_at, now()) WHERE id = $1", [batch.id]);

        return { batchId: batch.id, expiresAt: batch.fetch_expires_at, template: batch.message_template, recipients };
    });
}

// Records what Messenger did. results is [{ recipientId, status, at?, error? }] and must already be validated.
// A result that changes nothing is counted in ignored: a recipient in another batch (so one batch's token never edits
// another's rows), an id that does not exist, or one already sent. "sent" is final: a later failed or skipped for the
// same recipient does not undo it, because the text went out.
export async function recordResults(pool, token, results) {
    return withTransaction(pool, async (client) => {
        const found = await client.query(
            `SELECT id FROM messenger_batches
             WHERE token_hash = $1 AND results_expires_at > now()
             FOR UPDATE`,
            [hashToken(String(token))],
        );

        if (found.rows.length === 0) {
            return { error: "not_found" };
        }

        let updated = 0;
        let ignored = 0;

        for (const result of results) {
            const { rowCount } = await client.query(
                `UPDATE messenger_batch_recipients
                 SET status = $3,
                     sent_at = CASE WHEN $3 = 'sent' THEN COALESCE($4::timestamptz, now()) ELSE sent_at END,
                     error = CASE WHEN $3 = 'failed' THEN $5 ELSE NULL END
                 WHERE batch_id = $1 AND id = $2 AND status <> 'sent'`,
                [found.rows[0].id, result.recipientId, result.status, result.at ?? null, result.error ?? null],
            );

            if (rowCount === 1) {
                updated += 1;
            } else {
                ignored += 1;
            }
        }

        return { updated, ignored };
    });
}

// Newest first, with a count per status, for the staff list. Never the token, which is not stored.
export async function list(pool, { id = null, limit = 50 } = {}) {
    const { rows } = await pool.query(
        `SELECT batches.id, batches.created_at, batches.fetched_at, batches.fetch_expires_at, batches.results_expires_at,
                users.email AS created_by_email,
                count(recipients.id)::int AS total,
                (count(*) FILTER (WHERE recipients.status = 'sent'))::int AS sent,
                (count(*) FILTER (WHERE recipients.status = 'failed'))::int AS failed,
                (count(*) FILTER (WHERE recipients.status = 'skipped'))::int AS skipped
         FROM messenger_batches AS batches
         LEFT JOIN users ON users.id = batches.created_by
         LEFT JOIN messenger_batch_recipients AS recipients ON recipients.batch_id = batches.id
         WHERE ($2::int IS NULL OR batches.id = $2::int)
         GROUP BY batches.id, users.email
         ORDER BY batches.id DESC
         LIMIT $1`,
        [limit, id],
    );
    return rows;
}

// One batch and who was texted, for the staff detail page. null for an unknown id.
export async function find(pool, id) {
    const [batch] = await list(pool, { id });

    if (!batch) {
        return null;
    }

    const { rows } = await pool.query(
        `SELECT recipients.id, recipients.customer_id, customers.name, recipients.status, recipients.sent_at,
                recipients.error
         FROM messenger_batch_recipients AS recipients
         JOIN customers ON customers.id = recipients.customer_id
         WHERE recipients.batch_id = $1
         ORDER BY customers.name, recipients.id`,
        [id],
    );
    return { ...batch, recipients: rows };
}
