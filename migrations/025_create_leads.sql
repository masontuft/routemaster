-- A lead is a person who asked for service on the public /schedule page and is not a customer yet. Their typed
-- name, phone and street are kept once here instead of on every request they make. customer_id is set when staff
-- turn the lead into a customer, and SET NULL keeps the lead if that customer is deleted.
-- The three normalized columns are the match key. The UNIQUE constraint is what lets the public form reuse a lead
-- when the same person asks again, even if two visitors submit at the same moment.
CREATE TABLE leads (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone_normalized TEXT NOT NULL,
    address TEXT NOT NULL,
    address_normalized TEXT NOT NULL,
    customer_id INTEGER REFERENCES customers (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name_normalized, phone_normalized, address_normalized)
);

CREATE INDEX leads_customer_idx ON leads (customer_id);

-- No ON DELETE action, like property_id: a lead that still has requests cannot be deleted.
ALTER TABLE service_requests ADD COLUMN lead_id INTEGER REFERENCES leads (id);
CREATE INDEX service_requests_lead_idx ON service_requests (lead_id);

-- Transitional shape. An unmatched request now points at a lead, but the old contact_* columns stay until the
-- code stops reading them (the next migration drops them), so this accepts either.
ALTER TABLE service_requests DROP CONSTRAINT service_requests_matched_or_unmatched;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_matched_or_unmatched CHECK (
    (customer_id IS NOT NULL AND property_id IS NOT NULL)
    OR (customer_id IS NULL AND property_id IS NULL
        AND (lead_id IS NOT NULL
             OR (contact_name IS NOT NULL AND contact_phone IS NOT NULL AND contact_address IS NOT NULL)))
);

-- Backfill. The match keys are worked out here in SQL, because a migration cannot call the JavaScript in
-- src/utils. These functions follow normalizePersonName, normalizePhone and normalizeAddress, apart from letters
-- with accents, which are kept as they are. A key that differs only means the same person typing the same details
-- later gets a second lead, which staff can still match by hand. src/db/leadBackfill.test.js compares the two.
CREATE FUNCTION pg_temp.squash(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT trim(regexp_replace(regexp_replace(lower(COALESCE(value, '')), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))
$$;

CREATE FUNCTION pg_temp.address_key(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE(string_agg(COALESCE(abbreviation.short, word.text), ' ' ORDER BY word.position), '')
    FROM regexp_split_to_table(pg_temp.squash(value), ' ') WITH ORDINALITY AS word (text, position)
    LEFT JOIN (VALUES
        ('street', 'st'), ('avenue', 'ave'), ('road', 'rd'), ('drive', 'dr'), ('lane', 'ln'),
        ('court', 'ct'), ('boulevard', 'blvd'), ('circle', 'cir'), ('place', 'pl')
    ) AS abbreviation (long, short) ON abbreviation.long = word.text
$$;

CREATE FUNCTION pg_temp.phone_key(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN length(digits) = 11 AND digits LIKE '1%' THEN substr(digits, 2) ELSE digits END
    FROM (SELECT regexp_replace(COALESCE(value, ''), '\D', '', 'g') AS digits) AS only_digits
$$;

-- A rental note is taken out unless nobody would be left, then "&", "and" and a joining slash become one word.
CREATE FUNCTION pg_temp.name_key(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        lower(regexp_replace(chosen, '([a-z]{2})\s*/\s*(?=[a-z]{2})', '\1 and ', 'gi')),
        '&', ' and ', 'g'), '[''’‘.]', '', 'g'), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))
    FROM (
        SELECT CASE WHEN pg_temp.squash(without_rental) = '' THEN tidy ELSE without_rental END AS chosen
        FROM (
            SELECT tidy, trim(regexp_replace(
                regexp_replace(tidy, '(?:[''’]s)?\s*\(?\mrentals?\M\)?', ' ', 'gi'), '\s+', ' ', 'g')) AS without_rental
            FROM (SELECT trim(regexp_replace(COALESCE(value, ''), '\s+', ' ', 'g')) AS tidy) AS tidied
        ) AS rental
    ) AS picked
$$;

-- One lead per distinct person and address among the requests that carry typed details, taking the details of the
-- earliest request. Requests that were already matched get a lead too, so what the visitor typed is not lost when
-- the contact_* columns go, and that lead is marked as converted to the request's customer.
WITH typed AS (
    SELECT id, customer_id, created_at,
           trim(regexp_replace(contact_name, '\s+', ' ', 'g')) AS name,
           trim(contact_phone) AS phone,
           trim(contact_address) AS address,
           pg_temp.name_key(contact_name) AS name_key,
           pg_temp.phone_key(contact_phone) AS phone_key,
           pg_temp.address_key(contact_address) AS address_key
    FROM service_requests
    WHERE contact_name IS NOT NULL AND contact_phone IS NOT NULL AND contact_address IS NOT NULL
), first_typed AS (
    SELECT DISTINCT ON (name_key, phone_key, address_key) name, phone, address, name_key, phone_key, address_key, created_at
    FROM typed
    ORDER BY name_key, phone_key, address_key, created_at, id
), made AS (
    INSERT INTO leads (name, name_normalized, phone, phone_normalized, address, address_normalized, created_at)
    SELECT name, name_key, phone, phone_key, address, address_key, created_at FROM first_typed
    RETURNING id, name_normalized, phone_normalized, address_normalized
)
UPDATE service_requests SET lead_id = made.id
FROM typed
JOIN made ON made.name_normalized = typed.name_key
         AND made.phone_normalized = typed.phone_key
         AND made.address_normalized = typed.address_key
WHERE service_requests.id = typed.id;

UPDATE leads SET customer_id = converted.customer_id
FROM (
    SELECT lead_id, min(customer_id) AS customer_id
    FROM service_requests
    WHERE lead_id IS NOT NULL AND customer_id IS NOT NULL
    GROUP BY lead_id
) AS converted
WHERE leads.id = converted.lead_id;

DROP FUNCTION pg_temp.name_key(TEXT);
DROP FUNCTION pg_temp.phone_key(TEXT);
DROP FUNCTION pg_temp.address_key(TEXT);
DROP FUNCTION pg_temp.squash(TEXT);
