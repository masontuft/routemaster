import * as Staff from "./staff.js";

// The most requests one post can schedule, so a forged form cannot make the server loop without end.
export const MAX_SCHEDULE = 200;

const BOARD_SELECT = `
    SELECT service_requests.id, request_statuses.name AS status, service_types.name AS service_type,
           customers.name AS customer_name, customers.phone AS customer_phone,
           properties.street, properties.city, subdivisions.name AS area,
           to_char(service_requests.preferred_date, 'YYYY-MM-DD') AS preferred_date,
           service_requests.notes
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
