import { withTransaction } from "../db/transaction.js";
import * as Customer from "./customer.js";
import * as Property from "./property.js";
import { addHistory } from "./serviceRequest.js";
import { canMove } from "../utils/transitions.js";

// Dates come back as YYYY-MM-DD text so the server's time zone cannot shift them.
const LIST_SELECT = `
    SELECT service_requests.id, request_statuses.name AS status, service_types.name AS service_type,
           to_char(service_requests.preferred_date, 'YYYY-MM-DD') AS preferred_date,
           to_char(service_requests.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
           COALESCE(customers.name, service_requests.contact_name) AS customer_name,
           COALESCE(properties.street, service_requests.contact_address) AS street
    FROM service_requests
    JOIN request_statuses ON request_statuses.id = service_requests.status_id
    JOIN service_types ON service_types.id = service_requests.service_type_id
    LEFT JOIN customers ON customers.id = service_requests.customer_id
    LEFT JOIN properties ON properties.id = service_requests.property_id
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
                service_requests.contact_name, service_requests.contact_phone, service_requests.contact_address,
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
         WHERE service_requests.id = $1`,
        [id],
    );
    return rows[0] ?? null;
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
        `SELECT service_requests.customer_id, request_statuses.name AS status
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
             scheduled_date = COALESCE($3::date, scheduled_date), updated_at = now()
         WHERE id = $1`,
        [id, to, scheduledDate],
    );
    await addHistory(client, id, to, changedBy, note);
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

// Returns { ok: true } or { error } where error is one of: not_found, transition, property.
export async function matchToProperty(pool, id, propertyId, changedBy) {
    return withTransaction(pool, async (client) => {
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

        await attach(client, id, property.rows[0].customer_id, propertyId, changedBy, "Matched to an existing customer");
        return { ok: true };
    });
}

// Makes a customer and property from the typed contact details, with the city and ZIP staff supply.
export async function matchAsNew(pool, id, { city, zip }, changedBy) {
    return withTransaction(pool, async (client) => {
        const current = await lockRequest(client, id);

        if (!current) {
            return { error: "not_found" };
        }

        if (current.customer_id || !canMove(current.status, "Requested")) {
            return { error: "transition" };
        }

        const { rows } = await client.query(
            "SELECT contact_name, contact_phone, contact_address FROM service_requests WHERE id = $1",
            [id],
        );
        const contact = rows[0];
        const customerId = await Customer.create(client, { name: contact.contact_name, phone: contact.contact_phone });
        const propertyId = await Property.create(client, customerId, { street: contact.contact_address, city, zip });
        await attach(client, id, customerId, propertyId, changedBy, "Matched to a new customer");
        return { ok: true };
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
