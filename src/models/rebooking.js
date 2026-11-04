// Who to reach out to again. For one area and one year (a season), every customer with a property in the area is
// sorted by what their requests say:
//   booked          has a Requested, Scheduled or Completed request dated in the year
//   declined        no such request, but has a Cancelled one dated in the year
//   not_yet_booked  nothing dated in the year, and a Completed request in an earlier year: the outreach list
//   never_served    nothing dated in the year and never completed before (a new customer or a lead)
// A request's year is the year of the day it was booked for, or of the day it asked for when never booked. Booked
// beats declined, so a customer who cancelled and then asked again counts as booked.
const YEAR_OF_REQUEST = "EXTRACT(YEAR FROM COALESCE(service_requests.scheduled_date, service_requests.preferred_date))::int";

export const GROUPS = ["not_yet_booked", "declined", "never_served", "booked"];

export function classify({ booked, cancelledThisYear, servedBefore }) {
    if (booked) {
        return "booked";
    }

    if (cancelledThisYear) {
        return "declined";
    }

    return servedBefore ? "not_yet_booked" : "never_served";
}

// The group one customer falls in for a year, by the same rules as forArea. Used to recheck a customer on the server
// before acting on a ticked box, so a forged form cannot reach a customer the page would not have listed.
export async function groupOf(db, customerId, year) {
    const { rows } = await db.query(
        `SELECT bool_or(request_statuses.name IN ('Requested', 'Scheduled', 'Completed')
                        AND ${YEAR_OF_REQUEST} = $2) AS booked,
                bool_or(request_statuses.name = 'Cancelled' AND ${YEAR_OF_REQUEST} = $2) AS cancelled_this_year,
                bool_or(request_statuses.name = 'Completed' AND ${YEAR_OF_REQUEST} < $2) AS served_before
         FROM service_requests
         JOIN request_statuses ON request_statuses.id = service_requests.status_id
         WHERE service_requests.customer_id = $1`,
        [customerId, year],
    );
    return classify({
        booked: rows[0].booked, cancelledThisYear: rows[0].cancelled_this_year, servedBefore: rows[0].served_before,
    });
}

// areaId null means every customer who has a property, in any area or none.
export async function forArea(pool, areaId, year) {
    const { rows } = await pool.query(
        `SELECT customers.id, customers.name, customers.phone,
                (SELECT string_agg(properties.street, '; ' ORDER BY properties.id) FROM properties
                  WHERE properties.customer_id = customers.id
                    AND ($1::int IS NULL OR properties.subdivision_id = $1::int)) AS streets,
                COALESCE(seen.booked, false) AS booked,
                COALESCE(seen.cancelled_this_year, false) AS cancelled_this_year,
                COALESCE(seen.served_before, false) AS served_before,
                to_char(seen.last_served, 'YYYY-MM-DD') AS last_served,
                EXISTS (SELECT 1 FROM access_links WHERE access_links.customer_id = customers.id
                          AND access_links.created_at >= make_date($2, 1, 1)) AS contacted,
                EXISTS (SELECT 1 FROM access_links WHERE access_links.customer_id = customers.id
                          AND access_links.revoked_at IS NULL AND access_links.expires_at > now()) AS has_active_link
         FROM customers
         LEFT JOIN (
             SELECT service_requests.customer_id,
                    bool_or(request_statuses.name IN ('Requested', 'Scheduled', 'Completed')
                            AND ${YEAR_OF_REQUEST} = $2) AS booked,
                    bool_or(request_statuses.name = 'Cancelled' AND ${YEAR_OF_REQUEST} = $2) AS cancelled_this_year,
                    bool_or(request_statuses.name = 'Completed' AND ${YEAR_OF_REQUEST} < $2) AS served_before,
                    max(COALESCE(service_requests.scheduled_date, service_requests.preferred_date))
                        FILTER (WHERE request_statuses.name = 'Completed' AND ${YEAR_OF_REQUEST} < $2) AS last_served
             FROM service_requests
             JOIN request_statuses ON request_statuses.id = service_requests.status_id
             WHERE service_requests.customer_id IS NOT NULL
             GROUP BY service_requests.customer_id
         ) AS seen ON seen.customer_id = customers.id
         WHERE EXISTS (SELECT 1 FROM properties
                       WHERE properties.customer_id = customers.id
                         AND ($1::int IS NULL OR properties.subdivision_id = $1::int))
         ORDER BY customers.name, customers.id`,
        [areaId, year],
    );

    return rows.map((row) => {
        return {
            id: row.id,
            name: row.name,
            phone: row.phone,
            streets: row.streets,
            lastServed: row.last_served,
            contacted: row.contacted,
            hasActiveLink: row.has_active_link,
            group: classify({
                booked: row.booked, cancelledThisYear: row.cancelled_this_year, servedBefore: row.served_before,
            }),
        };
    });
}

export function countByGroup(customers) {
    const counts = Object.fromEntries(GROUPS.map((group) => {
        return [group, 0];
    }));

    for (const customer of customers) {
        counts[customer.group] += 1;
    }

    return counts;
}
