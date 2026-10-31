-- A request is either matched (customer and property known) or unmatched (typed contact details only,
-- waiting for a dispatcher to review). The CHECK keeps the two shapes from mixing.
-- customer_id CASCADE: deleting a customer deletes their requests.
-- property_id, service_type_id, status_id: no ON DELETE action (checked at the end of the statement), so a
-- row still in use cannot be deleted, yet deleting a customer can still cascade through properties and requests.
CREATE TABLE service_requests (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers (id) ON DELETE CASCADE,
    property_id INTEGER REFERENCES properties (id),
    service_type_id INTEGER NOT NULL REFERENCES service_types (id),
    status_id INTEGER NOT NULL REFERENCES request_statuses (id),
    preferred_date DATE NOT NULL,
    notes TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    contact_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT service_requests_matched_or_unmatched CHECK (
        (customer_id IS NOT NULL AND property_id IS NOT NULL)
        OR (customer_id IS NULL AND property_id IS NULL
            AND contact_name IS NOT NULL AND contact_phone IS NOT NULL AND contact_address IS NOT NULL)
    )
);

CREATE INDEX service_requests_customer_idx ON service_requests (customer_id);
CREATE INDEX service_requests_status_idx ON service_requests (status_id);
