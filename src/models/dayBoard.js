import { withTransaction } from "../db/transaction.js";
import * as Staff from "./staff.js";
import * as Rebooking from "./rebooking.js";
import { addHistory } from "./serviceRequest.js";

// The most requests one post can schedule, so a forged form cannot make the server loop without end.
export const MAX_SCHEDULE = 200;

const BOARD_SELECT = `
    SELECT service_requests.id, request_statuses.name AS status, service_types.name AS service_type,
           customers.name AS customer_name, customers.phone AS customer_phone,
           properties.street, properties.city, subdivisions.name AS area,
           to_char(service_requests.preferred_date, 'YYYY-MM-DD') AS preferred_date,
           service_requests.notes, service_requests.tentative
    FROM service_requests
    JOIN request_statuses ON request_statuses.id = service_requests.status_id
    JOIN service_types ON service_types.id = service_requests.service_type_id
    JOIN customers ON customers.id = service_requests.customer_id
    JOIN properties ON properties.id = service_requests.property_id
    LEFT JOIN subdivisions ON subdivisions.id = properties.subdivision_id
`;

// What staff see for one day: requests that asked for it and are still waiting, and requests already booked for it.
// Ordered by area then street, so customers who share a street sit together on the page.
export async function forDay(pool, day) {
    const waiting = await pool.query(
        `${BOARD_SELECT}
         WHERE request_statuses.name = 'Requested' AND service_requests.preferred_date = $1::date
         ORDER BY subdivisions.name NULLS LAST, properties.street, service_requests.id`,
        [day],
    );
    const booked = await pool.query(
        `${BOARD_SELECT}
         WHERE request_statuses.name = 'Scheduled' AND service_requests.scheduled_date = $1::date
         ORDER BY subdivisions.name NULLS LAST, properties.street, service_requests.id`,
        [day],
    );
    return { waiting: waiting.rows, booked: booked.rows };
}

// Days that have waiting requests, with how many, so staff can see which days need attention.
export async function busyDays(pool, today) {
    const { rows } = await pool.query(
        `SELECT to_char(service_requests.preferred_date, 'YYYY-MM-DD') AS day, count(*)::int AS waiting
         FROM service_requests
         JOIN request_statuses ON request_statuses.id = service_requests.status_id
         WHERE request_statuses.name = 'Requested' AND service_requests.preferred_date >= $1::date
         GROUP BY service_requests.preferred_date
         ORDER BY service_requests.preferred_date`,
        [today],
    );
    return rows;
}

// Books each request for the day through the same status change a single request uses, so the transition rules and
// the history entry are the same. Only requests still in Requested are booked here: a Scheduled one would pass the
// transition rules as a reschedule, and moving a booked job to another day is not what this board is for. Anything
// else (booked, cancelled, not matched, unknown id) is counted as skipped and does not stop the rest.
export async function scheduleMany(pool, ids, { day, changedBy }) {
    const wanted = ids.slice(0, MAX_SCHEDULE);
    const { rows } = await pool.query(
        `SELECT service_requests.id
         FROM service_requests
         JOIN request_statuses ON request_statuses.id = service_requests.status_id
         WHERE service_requests.id = ANY($1::int[]) AND request_statuses.name = 'Requested'
         ORDER BY service_requests.id`,
        [wanted],
    );
    const result = { scheduled: 0, skipped: wanted.length - rows.length };

    for (const { id } of rows) {
        const outcome = await Staff.changeStatus(pool, id, {
            to: "Scheduled", scheduledDate: day, note: "Booked from the day board", changedBy,
        });

        if (outcome.ok) {
            result.scheduled += 1;
        } else {
            result.skipped += 1;
        }
    }

    return result;
}

// Customers staff could pencil in for a day: those in an area that works the day, who were served in an earlier year
// and have nothing booked in the day's year (the rebooking "not yet booked" group). Each appears once.
export async function pencilInCandidates(pool, day) {
    const year = Number(day.slice(0, 4));
    const areas = await pool.query(
        `SELECT subdivisions.id, subdivisions.name FROM area_days
         JOIN subdivisions ON subdivisions.id = area_days.subdivision_id
         WHERE area_days.day = $1::date ORDER BY subdivisions.name, subdivisions.id`,
        [day],
    );
    const seen = new Set();
    const found = [];

    for (const area of areas.rows) {
        for (const customer of await Rebooking.forArea(pool, area.id, year)) {
            if (customer.group === "not_yet_booked" && !seen.has(customer.id)) {
                seen.add(customer.id);
                found.push({ ...customer, area: area.name });
            }
        }
    }

    return found;
}

// Pencils each customer in for the day: a Scheduled request marked tentative, on their property in an area that works
// that day, for the service they last had done (or the first active service if that one is gone). Nothing but the
// customer ids comes from the form. A customer is skipped when no property of theirs is in an area that works the day,
// when they already have a live request that year, or when there is no active service. The customer row is locked, so
// a customer who books themselves at the same moment is not double booked.
export async function pencilIn(pool, customerIds, { day, changedBy }) {
    const result = { pencilledIn: 0, skipped: 0 };
    const year = Number(day.slice(0, 4));

    for (const customerId of customerIds.slice(0, MAX_SCHEDULE)) {
        const done = await withTransaction(pool, async (client) => {
            const locked = await client.query("SELECT id FROM customers WHERE id = $1 FOR UPDATE", [customerId]);
            const property = await client.query(
                `SELECT properties.id FROM properties
                 JOIN area_days ON area_days.subdivision_id = properties.subdivision_id AND area_days.day = $2::date
                 WHERE properties.customer_id = $1 ORDER BY properties.id LIMIT 1`,
                [customerId, day],
            );
            const live = await client.query(
                `SELECT 1 FROM service_requests
                 JOIN request_statuses ON request_statuses.id = service_requests.status_id
                 WHERE service_requests.customer_id = $1
                   AND request_statuses.name IN ('Requested', 'Scheduled', 'Completed')
                   AND EXTRACT(YEAR FROM COALESCE(service_requests.scheduled_date, service_requests.preferred_date)) = $2
                 LIMIT 1`,
                [customerId, year],
            );

            if (!locked.rows[0] || !property.rows[0] || live.rows[0]) {
                return false;
            }

            const service = await client.query(
                `SELECT id FROM (
                     SELECT service_types.id, 0 AS rank,
                            COALESCE(service_requests.scheduled_date, service_requests.preferred_date) AS day
                     FROM service_requests
                     JOIN request_statuses ON request_statuses.id = service_requests.status_id
                     JOIN service_types ON service_types.id = service_requests.service_type_id
                     WHERE service_requests.customer_id = $1 AND request_statuses.name = 'Completed'
                       AND service_types.active
                     UNION ALL
                     SELECT service_types.id, 1, NULL FROM service_types WHERE service_types.active
                 ) AS choices
                 ORDER BY rank, day DESC NULLS LAST, id LIMIT 1`,
                [customerId],
            );

            if (!service.rows[0]) {
                return false;
            }

            const created = await client.query(
                `INSERT INTO service_requests
                    (customer_id, property_id, service_type_id, status_id, preferred_date, scheduled_date, tentative)
                 SELECT $1, $2, $3, id, $4::date, $4::date, true FROM request_statuses WHERE name = 'Scheduled'
                 RETURNING id`,
                [customerId, property.rows[0].id, service.rows[0].id, day],
            );
            await addHistory(
                client, created.rows[0].id, "Scheduled", changedBy,
                `Penciled in for ${day}; the customer has not confirmed`,
            );
            return true;
        });

        result[done ? "pencilledIn" : "skipped"] += 1;
    }

    return result;
}
