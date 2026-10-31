-- CASCADE: history belongs to its request. changed_by SET NULL: keep history if a staff user is deleted.
CREATE TABLE status_history (
    id SERIAL PRIMARY KEY,
    service_request_id INTEGER NOT NULL REFERENCES service_requests (id) ON DELETE CASCADE,
    status_id INTEGER NOT NULL REFERENCES request_statuses (id),
    changed_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    note TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX status_history_request_idx ON status_history (service_request_id);
