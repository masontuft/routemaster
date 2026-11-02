-- Spreadsheet import. A batch is one confirmed import and keeps its counts. A mapping remembers how one
-- tab of one sheet was mapped, so the next import of that tab starts from the same choices.
-- The sheet id comes from a public link, so it is stored as it is. plan_hash is the SHA-256 of the plan
-- the owner saw, kept so a batch can be matched to its preview.
CREATE TABLE import_batches (
    id SERIAL PRIMARY KEY,
    created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    sheet_id TEXT NOT NULL,
    sheet_name TEXT NOT NULL,
    season_year INTEGER NOT NULL,
    plan_hash CHAR(64) NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
    customers_created INTEGER NOT NULL DEFAULT 0 CHECK (customers_created >= 0),
    properties_created INTEGER NOT NULL DEFAULT 0 CHECK (properties_created >= 0),
    jobs_created INTEGER NOT NULL DEFAULT 0 CHECK (jobs_created >= 0),
    jobs_existing INTEGER NOT NULL DEFAULT 0 CHECK (jobs_existing >= 0),
    rows_skipped INTEGER NOT NULL DEFAULT 0 CHECK (rows_skipped >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- columns is {"name": 0, "street": 2, ...}: field to zero-based column. options holds the import-wide choices.
CREATE TABLE import_mappings (
    id SERIAL PRIMARY KEY,
    sheet_id TEXT NOT NULL,
    sheet_name TEXT NOT NULL,
    header_row INTEGER NOT NULL CHECK (header_row >= 1),
    columns JSONB NOT NULL,
    options JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sheet_id, sheet_name)
);

-- An area a property sits in. No ON DELETE action on properties.subdivision_id: an area still in use cannot be deleted.
CREATE TABLE subdivisions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    name_normalized TEXT NOT NULL UNIQUE
);

ALTER TABLE properties ADD COLUMN subdivision_id INTEGER REFERENCES subdivisions (id);

-- Which batch created a row. SET NULL keeps the row if a batch record is ever cleaned up.
-- The indexes are for finding everything one batch created.
ALTER TABLE customers ADD COLUMN import_batch_id INTEGER REFERENCES import_batches (id) ON DELETE SET NULL;
ALTER TABLE properties ADD COLUMN import_batch_id INTEGER REFERENCES import_batches (id) ON DELETE SET NULL;
ALTER TABLE service_requests ADD COLUMN import_batch_id INTEGER REFERENCES import_batches (id) ON DELETE SET NULL;
CREATE INDEX customers_import_batch_idx ON customers (import_batch_id);
CREATE INDEX properties_import_batch_idx ON properties (import_batch_id);
CREATE INDEX service_requests_import_batch_idx ON service_requests (import_batch_id);

-- What was charged, in integer cents, for a job brought in from a spreadsheet. Empty when unknown.
ALTER TABLE service_requests ADD COLUMN amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents >= 0);
