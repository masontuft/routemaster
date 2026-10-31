-- One review per completed request, written by the customer who owns it.
-- Both foreign keys CASCADE: deleting a customer (or their request) deletes the review.
-- hidden is the moderation flag: a hidden review is kept but not shown on the public page.
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    service_request_id INTEGER NOT NULL UNIQUE REFERENCES service_requests (id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body TEXT NOT NULL DEFAULT '',
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reviews_customer_idx ON reviews (customer_id);
