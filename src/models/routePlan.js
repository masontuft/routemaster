import { withTransaction } from "../db/transaction.js";

const STOP_COLUMNS = `
    service_requests.id AS request_id, customers.name AS customer_name, customers.phone AS customer_phone,
    service_requests.notes AS request_notes, properties.notes AS property_notes,
    properties.id AS property_id, properties.street, properties.city, properties.zip,
    properties.latitude, properties.longitude, properties.geocode_status, subdivisions.name AS area,
    request_statuses.name AS status
`;
const STOP_FROM = `
    FROM service_requests
    JOIN request_statuses ON request_statuses.id = service_requests.status_id
    JOIN customers ON customers.id = service_requests.customer_id
    JOIN properties ON properties.id = service_requests.property_id
    LEFT JOIN subdivisions ON subdivisions.id = properties.subdivision_id
`;

// The jobs booked for a day, with whether each one has a map point yet. Ordered by id, so a route built twice from
// the same jobs starts from the same list and so comes out the same.
export async function bookedForDay(pool, day) {
    const { rows } = await pool.query(
        `SELECT ${STOP_COLUMNS} ${STOP_FROM}
         WHERE request_statuses.name = 'Scheduled' AND service_requests.scheduled_date = $1::date
         ORDER BY service_requests.id`,
        [day],
    );
    return rows;
}

// Replaces the day's route. stops are in driving order and carry requestId, legMiles, legMinutes, arriveMinutes
// and departMinutes. One transaction, so a failure never leaves the day with no route or half of one.
export async function replaceForDay(pool, { day, createdBy, start, startTime, serviceMinutes, totals, stops }) {
    return withTransaction(pool, async (client) => {
        await client.query("DELETE FROM routes WHERE route_day = $1::date", [day]);
        const { rows } = await client.query(
            `INSERT INTO routes (route_day, created_by, start_address, start_lat, start_lng, start_time,
                                 service_minutes, total_miles, travel_minutes)
             VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [day, createdBy, start.address, start.lat, start.lng, startTime, serviceMinutes,
                totals.miles.toFixed(2), totals.travelMinutes],
        );

        for (const [index, stop] of stops.entries()) {
            await client.query(
                `INSERT INTO route_stops (route_id, position, service_request_id, leg_miles, leg_minutes,
                                          arrive_minutes, depart_minutes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [rows[0].id, index + 1, stop.requestId, stop.legMiles.toFixed(2), stop.legMinutes,
                    stop.arriveMinutes, stop.departMinutes],
            );
        }

        return rows[0].id;
    });
}

// The saved route for a day with each stop's current details, or null. A stop whose job was cancelled since still
// shows, with its status, so the page can warn instead of silently dropping it.
export async function findForDay(pool, day) {
    const route = await pool.query(
        `SELECT id, to_char(route_day, 'YYYY-MM-DD') AS route_day, start_address, start_time, service_minutes,
                total_miles::float AS total_miles, travel_minutes, created_at
         FROM routes WHERE route_day = $1::date`,
        [day],
    );

    if (!route.rows[0]) {
        return null;
    }

    const stops = await pool.query(
        `SELECT route_stops.position, route_stops.leg_miles::float AS leg_miles, route_stops.arrive_minutes,
                route_stops.depart_minutes, ${STOP_COLUMNS}
         ${STOP_FROM}
         JOIN route_stops ON route_stops.service_request_id = service_requests.id
         WHERE route_stops.route_id = $1
         ORDER BY route_stops.position`,
        [route.rows[0].id],
    );
    return { ...route.rows[0], stops: stops.rows };
}
