-- A customer is a person the company serves. Customers imported from the spreadsheet have no login,
-- so user_id is optional and SET NULL keeps the customer if their user account is deleted.
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users (id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    phone TEXT,
    phone_normalized TEXT,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX customers_match_idx ON customers (name_normalized, phone_normalized);
