import { withTransaction } from "../db/transaction.js";

const DETAIL_SELECT = `
    SELECT service_requests.id, service_requests.property_id, service_requests.preferred_date,
           to_char(service_requests.preferred_date, 'YYYY-MM-DD') AS preferred_day, service_requests.notes,
           service_requests.created_at, service_requests.tentative, request_statuses.name AS status,
           service_types.name AS service_type,
           properties.street, properties.city
    FROM service_requests
    JOIN request_statuses ON request_statuses.id = service_requests.status_id
    JOIN service_types ON service_types.id = service_requests.service_type_id
    JOIN properties ON properties.id = service_requests.property_id
`;

export async function addHistory(client, requestId, statusName, changedBy, note) {
    await client.query(
        `INSERT INTO status_history (service_request_id, status_id, changed_by, note)
         SELECT $1, id, $2, $3 FROM request_statuses WHERE name = $4`,
        [requestId, changedBy, note ?? null, statusName],
    );
}

// Matched request: needs customerId and propertyId. Unmatched request: pass contact instead.
export async function create(pool, details) {
    const { customerId, propertyId, serviceTypeId, preferredDate, notes, contact, changedBy } = details;
    const statusName = customerId ? "Requested" : "Needs Review";

    return withTransaction(pool, async (client) => {
        // The same row lock penciling in takes, so a customer asking for a day and staff penciling them in for the
        // same year are serialized: whichever comes second sees the first's request.
        if (customerId) {
            await client.query("SELECT id FROM customers WHERE id = $1 FOR UPDATE", [customerId]);
        }

        const { rows } = await client.query(
            `INSERT INTO service_requests
                (customer_id, property_id, service_type_id, status_id, preferred_date, notes,
                 contact_name, contact_phone, contact_address)
             SELECT $1, $2, $3, id, $4, $5, $6, $7, $8 FROM request_statuses WHERE name = $9
             RETURNING id`,
            [
                customerId ?? null, propertyId ?? null, serviceTypeId, preferredDate, notes || null,
                contact?.name ?? null, contact?.phone ?? null, contact?.address ?? null, statusName,
            ],
        );
        await addHistory(client, rows[0].id, statusName, changedBy ?? null, "Request received");
        return rows[0].id;
    });
}

export async function listForCustomer(pool, customerId) {
    const { rows } = await pool.query(
        `${DETAIL_SELECT} WHERE service_requests.customer_id = $1
         ORDER BY service_requests.created_at DESC, service_requests.id DESC`,
        [customerId],
    );
    return rows;
}

// Returns null unless the request belongs to this customer, so ids cannot be probed.
export async function findForCustomer(pool, id, customerId) {
    const { rows } = await pool.query(
        `${DETAIL_SELECT} WHERE service_requests.id = $1 AND service_requests.customer_id = $2`,
        [id, customerId],
    );
    return rows[0] ?? null;
}

export async function historyFor(pool, id) {
    const { rows } = await pool.query(
        `SELECT request_statuses.name AS status, status_history.note, status_history.changed_at
         FROM status_history
         JOIN request_statuses ON request_statuses.id = status_history.status_id
         WHERE status_history.service_request_id = $1
         ORDER BY status_history.changed_at, status_history.id`,
        [id],
    );
    return rows;
}

// Date and notes can change while the request is Requested. A tentative booking (staff penciled the customer in)
// can be changed too, and the customer's answer settles it: the same day is a confirmation and the booking stays;
// a different day drops it back to Requested for staff to book on that day. Returns true when something changed.
export async function updateDetails(pool, id, customerId, { preferredDate, notes }, changedBy = null) {
    return withTransaction(pool, async (client) => {
        const { rows } = await client.query(
            `SELECT request_statuses.name AS status, service_requests.tentative,
                    to_char(service_requests.preferred_date, 'YYYY-MM-DD') AS day
             FROM service_requests
             JOIN request_statuses ON request_statuses.id = service_requests.status_id
             WHERE service_requests.id = $1 AND service_requests.customer_id = $2
             FOR UPDATE OF service_requests`,
            [id, customerId],
        );
        const current = rows[0];

        if (current?.status === "Requested") {
            await client.query(
                "UPDATE service_requests SET preferred_date = $2, notes = $3, updated_at = now() WHERE id = $1",
                [id, preferredDate, notes || null],
            );
            return true;
        }

        if (current?.status !== "Scheduled" || !current.tentative) {
            return false;
        }

        if (preferredDate === current.day) {
            await client.query(
                "UPDATE service_requests SET notes = $2, tentative = false, updated_at = now() WHERE id = $1",
                [id, notes || null],
            );
            await addHistory(client, id, "Scheduled", changedBy, "Confirmed by customer");
        } else {
            await client.query(
                `UPDATE service_requests
                 SET status_id = (SELECT id FROM request_statuses WHERE name = 'Requested'), preferred_date = $2,
                     scheduled_date = NULL, notes = $3, tentative = false, updated_at = now()
                 WHERE id = $1`,
                [id, preferredDate, notes || null],
            );
            await addHistory(client, id, "Requested", changedBy, `Customer chose a different day: ${preferredDate}`);
        }

        return true;
    });
}

// The customer accepts a penciled-in day. Only their own tentative booking changes.
export async function confirm(pool, id, customerId, changedBy) {
    return withTransaction(pool, async (client) => {
        const { rowCount } = await client.query(
            `UPDATE service_requests SET tentative = false, updated_at = now()
             WHERE id = $1 AND customer_id = $2 AND tentative
               AND status_id = (SELECT id FROM request_statuses WHERE name = 'Scheduled')`,
            [id, customerId],
        );

        if (rowCount === 1) {
            await addHistory(client, id, "Scheduled", changedBy, "Confirmed by customer");
        }

        return rowCount === 1;
    });
}

export async function cancel(pool, id, customerId, changedBy) {
    return withTransaction(pool, async (client) => {
        const { rowCount } = await client.query(
            `UPDATE service_requests
             SET status_id = (SELECT id FROM request_statuses WHERE name = 'Cancelled'), tentative = false,
                 updated_at = now()
             WHERE id = $1 AND customer_id = $2
               AND (status_id = (SELECT id FROM request_statuses WHERE name = 'Requested')
                    OR (tentative AND status_id = (SELECT id FROM request_statuses WHERE name = 'Scheduled')))`,
            [id, customerId],
        );

        if (rowCount === 1) {
            await addHistory(client, id, "Cancelled", changedBy, "Cancelled by customer");
        }

        return rowCount === 1;
    });
}
