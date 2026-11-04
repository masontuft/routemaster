-- Company-wide options the owner can change without a deploy. Values are short text; the app checks each key
-- against its own list of allowed values (src/utils/settings.js), so a row can hold a key the app does not know yet.
-- SET NULL keeps the setting if the user who last changed it is deleted.
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]{1,50}$'),
    value TEXT NOT NULL CHECK (char_length(value) <= 100),
    updated_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A tentative request is a booking staff made for a customer who has not confirmed the day. The customer's own
-- requests are confirmed (false). A tentative request becomes confirmed when the customer accepts the day or staff
-- mark it confirmed, and stops being tentative if it is completed or cancelled.
ALTER TABLE service_requests ADD COLUMN tentative BOOLEAN NOT NULL DEFAULT false;
