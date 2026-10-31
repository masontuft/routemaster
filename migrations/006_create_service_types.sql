-- Money is integer cents. Prices are 0 until the real prices are known.
CREATE TABLE service_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO service_types (name) VALUES ('Sprinkler Blowout'), ('Sprinkler Startup');
