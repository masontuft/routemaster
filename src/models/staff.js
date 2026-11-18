import { withTransaction } from "../db/transaction.js";
import * as Customer from "./customer.js";
import * as Property from "./property.js";
import * as Lead from "./lead.js";
import { addHistory } from "./serviceRequest.js";
import { canMove } from "../utils/transitions.js";

// Dates come back as YYYY-MM-DD text so the server's time zone cannot shift them.
const LIST_SELECT = `
    SELECT service_requests.id, request_statuses.name AS status, service_types.name AS service_type,
           to_char(service_requests.preferred_date, 'YYYY-MM-DD') AS preferred_date,
           to_char(service_requests.scheduled_date, 'YYYY-MM-DD') AS scheduled_date, service_requests.tentative,
           COALESCE(customers.name, leads.name) AS customer_name,
           COALESCE(properties.street, leads.address) AS street
    FROM service_requests
    JOIN request_statuses ON request_statuses.id = service_requests.status_id
    JOIN service_types ON service_types.id = service_requests.service_type_id
    LEFT JOIN customers ON customers.id = service_requests.customer_id
    LEFT JOIN properties ON properties.id = service_requests.property_id
    LEFT JOIN leads ON leads.id = service_requests.lead_id
`;

export async function countsByStatus(pool) {
    const { rows } = await pool.query(
        `SELECT request_statuses.name AS status, count(service_requests.id)::int AS total
         FROM request_statuses
         LEFT JOIN service_requests ON service_requests.status_id = request_statuses.id
         GROUP BY request_statuses.id ORDER BY request_statuses.id`,
    );
    return rows;
}

// status is optional and is only ever a bound parameter. Oldest first for the Needs Review queue.
export async function listRequests(pool, { status = null, limit = 200 } = {}) {
    const { rows } = await pool.query(
        `${LIST_SELECT} WHERE ($1::text IS NULL OR request_statuses.name = $1)
         ORDER BY service_requests.created_at DESC, service_requests.id DESC LIMIT $2`,
        [status, limit],
    );
    return rows;
}

export async function findRequest(pool, id) {
    const { rows } = await pool.query(
        `SELECT service_requests.id, service_requests.customer_id, service_requests.notes,
                service_requests.lead_id, leads.name AS lead_name, leads.phone AS lead_phone,
                leads.address AS lead_address,
                (SELECT count(*)::int FROM service_requests other
                 JOIN request_statuses other_status ON other_status.id = other.status_id
                 WHERE other.lead_id = service_requests.lead_id AND other.customer_id IS NULL
                   AND other.id <> service_requests.id AND other_status.name = 'Needs Review') AS lead_other_open,
                service_requests.referred_by, service_requests.tentative,
                request_statuses.name AS status, service_types.name AS service_type,
                to_char(service_requests.preferred_date, 'YYYY-MM-DD') AS preferred_date,
                to_char(service_requests.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
                customers.name AS customer_name, customers.phone AS customer_phone,
                properties.street, properties.city
         FROM service_requests
         JOIN request_statuses ON request_statuses.id = service_requests.status_id
         JOIN service_types ON service_types.id = service_requests.service_type_id
         LEFT JOIN customers ON customers.id = service_requests.customer_id
         LEFT JOIN properties ON properties.id = service_requests.property_id
         LEFT JOIN leads ON leads.id = service_requests.lead_id
         WHERE service_requests.id = $1`,
        [id],
    );
    return rows[0] ?? null;
}

// referredBy is already trimmed. Null clears the name. Payout amounts are not stored.
export async function setReferrer(pool, id, referredBy) {
    const { rowCount } = await pool.query(
        `UPDATE service_requests SET referred_by = $2, updated_at = now() WHERE id = $1`,
        [id, referredBy],
    );
    return rowCount === 1;
}

export async function historyFor(pool, id) {
    const { rows } = await pool.query(
        `SELECT request_statuses.name AS status, status_history.note, status_history.changed_at,
                users.email AS changed_by_email
         FROM status_history
         JOIN request_statuses ON request_statuses.id = status_history.status_id
         LEFT JOIN users ON users.id = status_history.changed_by
         WHERE status_history.service_request_id = $1
         ORDER BY status_history.changed_at, status_history.id`,
        [id],
    );
    return rows;
}

// Locks the request row so two staff members acting at once cannot both pass the transition check.
async function lockRequest(client, id) {
    const { rows } = await client.query(
        `SELECT service_requests.customer_id, service_requests.lead_id, request_statuses.name AS status
         FROM service_requests
         JOIN request_statuses ON request_statuses.id = service_requests.status_id
         WHERE service_requests.id = $1
         FOR UPDATE OF service_requests`,
        [id],
    );
    return rows[0] ?? null;
}

async function setStatus(client, id, to, scheduledDate, note, changedBy) {
    await client.query(
        `UPDATE service_requests
         SET status_id = (SELECT id FROM request_statuses WHERE name = $2),
             scheduled_date = COALESCE($3::date, scheduled_date),
             tentative = CASE WHEN $2 IN ('Completed', 'Cancelled') THEN false ELSE tentative END,
             updated_at = now()
         WHERE id = $1`,
        [id, to, scheduledDate],
    );
    await addHistory(client, id, to, changedBy, note);
}

// Staff mark a penciled-in booking confirmed, for example after the customer said yes by phone.
export async function confirmTentative(pool, id, changedBy) {
    return withTransaction(pool, async (client) => {
        const { rowCount } = await client.query(
            `UPDATE service_requests SET tentative = false, updated_at = now()
             WHERE id = $1 AND tentative
               AND status_id = (SELECT id FROM request_statuses WHERE name = 'Scheduled')`,
            [id],
        );

        if (rowCount === 1) {
            await addHistory(client, id, "Scheduled", changedBy, "Confirmed by staff");
        }

        return rowCount === 1;
    });
}

// Returns { ok: true } or { error } where error is one of: not_found, transition, unmatched, date.
export async function changeStatus(pool, id, { to, scheduledDate, note, changedBy }) {
    return withTransaction(pool, async (client) => {
        const current = await lockRequest(client, id);

        if (!current) {
            return { error: "not_found" };
        }

        if (!canMove(current.status, to)) {
            return { error: "transition" };
        }

        // Leaving Needs Review for Requested is matching's job, because it needs a customer.
        if (!current.customer_id && to !== "Cancelled") {
            return { error: "unmatched" };
        }

        if (to === "Scheduled" && !scheduledDate) {
            return { error: "date" };
        }

        const text = to === "Scheduled" ? `Scheduled for ${scheduledDate}${note ? ` - ${note}` : ""}` : note;
        await setStatus(client, id, to, to === "Scheduled" ? scheduledDate : null, text, changedBy);
        return { ok: true };
    });
}

async function attach(client, id, customerId, propertyId, changedBy, note) {
    await client.query(
        "UPDATE service_requests SET customer_id = $2, property_id = $3 WHERE id = $1",
        [id, customerId, propertyId],
    );
    await setStatus(client, id, "Requested", null, note, changedBy);
}

// Locks a request's lead before the request itself. Matching one request also matches the lead's other open
// requests, so two staff matching different requests of one lead must queue on the lead first. If each locked its
// own request first and then reached for the other's, they could wait on each other for ever.
async function lockLeadOf(client, requestId) {
    await client.query(
        `SELECT leads.id FROM leads
         JOIN service_requests ON service_requests.lead_id = leads.id
         WHERE service_requests.id = $1
         FOR UPDATE OF leads`,
        [requestId],
    );
}

// Matches the request, then the lead's other Needs Review requests to the same customer and property, because
// they are the same person at the same address. A request already cancelled is left alone. Then the lead is
// marked as converted. Returns how many other requests were matched too.
async function attachWithLead(client, id, customerId, propertyId, changedBy, note) {
    const { rows } = await client.query("SELECT lead_id FROM service_requests WHERE id = $1", [id]);
    const leadId = rows[0].lead_id;
    await attach(client, id, customerId, propertyId, changedBy, note);

    if (!leadId) {
        return 0;
    }

    const others = await client.query(
        `SELECT service_requests.id FROM service_requests
         JOIN request_statuses ON request_statuses.id = service_requests.status_id
         WHERE service_requests.lead_id = $1 AND service_requests.customer_id IS NULL
           AND service_requests.id <> $2 AND request_statuses.name = 'Needs Review'
         ORDER BY service_requests.id
         FOR UPDATE OF service_requests`,
        [leadId, id],
    );

    for (const other of others.rows) {
        await attach(client, other.id, customerId, propertyId, changedBy, `Matched together with request ${id}`);
    }

    await Lead.markConverted(client, leadId, customerId);
    return others.rowCount;
}

// Returns { ok: true } or { error } where error is one of: not_found, transition, property.
export async function matchToProperty(pool, id, propertyId, changedBy) {
    return withTransaction(pool, async (client) => {
        await lockLeadOf(client, id);
        const current = await lockRequest(client, id);

        if (!current) {
            return { error: "not_found" };
        }

        if (current.customer_id || !canMove(current.status, "Requested")) {
            return { error: "transition" };
        }

        const property = await client.query("SELECT customer_id FROM properties WHERE id = $1", [propertyId]);

        if (!property.rows[0]) {
            return { error: "property" };
        }

        const alsoMatched = await attachWithLead(
            client, id, property.rows[0].customer_id, propertyId, changedBy, "Matched to an existing customer",
        );
        return { ok: true, alsoMatched };
    });
}

// Makes a customer and property from the lead's typed details, with the city and ZIP staff supply.
export async function matchAsNew(pool, id, { city, zip }, changedBy) {
    return withTransaction(pool, async (client) => {
        await lockLeadOf(client, id);
        const current = await lockRequest(client, id);

        if (!current) {
            return { error: "not_found" };
        }

        if (current.customer_id || !canMove(current.status, "Requested")) {
            return { error: "transition" };
        }

        const lead = await Lead.findById(client, current.lead_id);
        const customerId = await Customer.create(client, { name: lead.name, phone: lead.phone });
        const propertyId = await Property.create(client, customerId, { street: lead.address, city, zip });
        const alsoMatched = await attachWithLead(client, id, customerId, propertyId, changedBy, "Matched to a new customer");
        return { ok: true, alsoMatched };
    });
}

// Owner numbers. Month boundaries use the database time zone. Scheduled value uses today's catalog prices.
export async function stats(pool) {
    const { rows } = await pool.query(
        `SELECT
            count(*) FILTER (WHERE service_requests.created_at >= date_trunc('month', now()))::int AS requested_this_month,
            count(*) FILTER (WHERE request_statuses.name = 'Completed'
                              AND service_requests.updated_at >= date_trunc('month', now()))::int AS completed_this_month,
            COALESCE(sum(service_types.price_cents) FILTER (WHERE request_statuses.name = 'Scheduled'), 0)::int
                AS scheduled_cents
         FROM service_requests
         JOIN request_statuses ON request_statuses.id = service_requests.status_id
         JOIN service_types ON service_types.id = service_requests.service_type_id`,
    );
    return rows[0];
}
