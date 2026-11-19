-- A record of sensitive changes to logins (ADR 0018): an email changed, a password changed, a role changed, a staff user
-- created. One row per action, written in the same transaction as the change, so there is no change without a record.
-- company_id has no default: the contract migration removed the default company, and every writer names one. RESTRICT keeps a
-- company that has a log from being deleted by mistake.
-- actor_id and target_id are SET NULL when a user is deleted, so the row stays. details holds what was changed in words
-- that outlive the user, such as the old and new email. It never holds a password or a hash.
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    actor_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action <> '' AND char_length(action) <= 50),
    target_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The log page reads one company's newest rows.
CREATE INDEX audit_log_company_idx ON audit_log (company_id, id DESC);
