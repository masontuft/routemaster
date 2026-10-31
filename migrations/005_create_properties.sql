-- CASCADE: a property means nothing without its customer.
CREATE TABLE properties (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    street TEXT NOT NULL,
    city TEXT NOT NULL,
    zip TEXT,
    address_normalized TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX properties_customer_idx ON properties (customer_id);
CREATE INDEX properties_address_idx ON properties (address_normalized);
