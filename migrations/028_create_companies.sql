-- Companies (ADR 0018). A company is one business using Routemaster. Its customers, areas, requests, routes, staff and
-- batches are its own and are never shown to another company.
-- slug is the short name used in a company's public address later (/w/<slug>/schedule). It is lower-case words joined by
-- hyphens, and it is kept short.
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL CHECK (name <> '' AND char_length(name) <= 100),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company 1 is the business that already uses the app, Tuft Sprinkler Blowouts (named by Mason, 2026-11-18).
-- Everything in the database today belongs to it. Nothing reads the slug yet. The id is written out and the
-- sequence moved past it, so the next company is 2 whatever state the sequence was in.
INSERT INTO companies (id, name, slug) VALUES (1, 'Tuft Sprinkler Blowouts', 'tuft-sprinkler-blowouts');
SELECT setval(pg_get_serial_sequence('companies', 'id'), 1);

-- Each table that holds one company's data gets company_id. A table that belongs to a parent (properties, access_links,
-- area_days, route_stops, reviews, status_history, messenger_batch_recipients) is reached through that parent, so it
-- has no column of its own. roles, request_statuses and service_types stay shared by every company.
--
-- Expand first. Each deploy runs this migration before the new code starts, so for a moment the old code is still
-- inserting rows without a company_id. DEFAULT 1 lets those inserts succeed, and Postgres fills the existing rows
-- from the default without rewriting the table. The default is a bridge, not the design: while it stays, a query
-- that forgets to set a company writes into company 1 without any error. A later migration, shipped with the code
-- that sets company_id everywhere, drops it.
--
-- RESTRICT: a company that still has data cannot be deleted by mistake.
--
-- No unique constraint is changed here. Some code names its constraint in ON CONFLICT (app_settings.key,
-- import_mappings, subdivisions.name_normalized, leads), so changing a constraint under live code would fail
-- every such insert. The per-company versions of those constraints come with the same later migration.
ALTER TABLE users ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE customers ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE leads ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE subdivisions ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE service_requests ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE routes ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE import_batches ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE import_mappings ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE link_batches ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE messenger_batches ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE contact_messages ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE app_settings ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;

-- Postgres does not index a foreign key by itself, and every list page will filter on company_id.
CREATE INDEX users_company_idx ON users (company_id);
CREATE INDEX customers_company_idx ON customers (company_id);
CREATE INDEX leads_company_idx ON leads (company_id);
CREATE INDEX subdivisions_company_idx ON subdivisions (company_id);
CREATE INDEX service_requests_company_idx ON service_requests (company_id);
CREATE INDEX routes_company_idx ON routes (company_id);
CREATE INDEX import_batches_company_idx ON import_batches (company_id);
CREATE INDEX import_mappings_company_idx ON import_mappings (company_id);
CREATE INDEX link_batches_company_idx ON link_batches (company_id);
CREATE INDEX messenger_batches_company_idx ON messenger_batches (company_id);
CREATE INDEX contact_messages_company_idx ON contact_messages (company_id);
CREATE INDEX app_settings_company_idx ON app_settings (company_id);
