-- A built route for one day: where it starts, the timing used, and the stops in driving order. There is one route
-- per day, and building again replaces it. Customer names, addresses and phones are not copied here; a stop points
-- at its service request, so the page always shows the current details.
-- Deleting a request removes its stop (CASCADE). Deleting the user keeps the route (SET NULL).
CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    route_day DATE NOT NULL UNIQUE,
    created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    start_address TEXT NOT NULL,
    start_lat DOUBLE PRECISION NOT NULL CHECK (start_lat BETWEEN -90 AND 90),
    start_lng DOUBLE PRECISION NOT NULL CHECK (start_lng BETWEEN -180 AND 180),
    start_time CHAR(5) NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    service_minutes INTEGER NOT NULL CHECK (service_minutes BETWEEN 5 AND 120),
    total_miles NUMERIC(8, 2) NOT NULL CHECK (total_miles >= 0),
    travel_minutes INTEGER NOT NULL CHECK (travel_minutes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE route_stops (
    route_id INTEGER NOT NULL REFERENCES routes (id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 1),
    service_request_id INTEGER NOT NULL REFERENCES service_requests (id) ON DELETE CASCADE,
    leg_miles NUMERIC(8, 2) NOT NULL CHECK (leg_miles >= 0),
    leg_minutes INTEGER NOT NULL CHECK (leg_minutes >= 0),
    arrive_minutes INTEGER NOT NULL CHECK (arrive_minutes >= 0),
    depart_minutes INTEGER NOT NULL CHECK (depart_minutes >= arrive_minutes),
    PRIMARY KEY (route_id, position),
    UNIQUE (route_id, service_request_id)
);
