-- One run of "make a scheduling link for every customer in an area". The batch keeps who ran it, for which area,
-- how long the links last and what it did, so a bulk export of links leaves a record. The tokens themselves are
-- never stored, only their hashes in access_links, as for a single link.
-- SET NULL keeps the record if the user or area is ever removed. Deleting a batch does not delete its links.
CREATE TABLE link_batches (
    id SERIAL PRIMARY KEY,
    subdivision_id INTEGER REFERENCES subdivisions (id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 120),
    links_created INTEGER NOT NULL DEFAULT 0 CHECK (links_created >= 0),
    skipped_no_phone INTEGER NOT NULL DEFAULT 0 CHECK (skipped_no_phone >= 0),
    skipped_active INTEGER NOT NULL DEFAULT 0 CHECK (skipped_active >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE access_links ADD COLUMN link_batch_id INTEGER REFERENCES link_batches (id) ON DELETE SET NULL;
CREATE INDEX access_links_batch_idx ON access_links (link_batch_id);
