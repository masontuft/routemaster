-- An unmatched request now points at its lead (migration 025), so the typed name, phone and address no longer
-- live on the request. The new CHECK runs against every row when it is added, so this migration fails and rolls back
-- if any unmatched request still has no lead. Forward-only: the typed text is kept on the leads.
ALTER TABLE service_requests DROP CONSTRAINT service_requests_matched_or_unmatched;
ALTER TABLE service_requests
    DROP COLUMN contact_name,
    DROP COLUMN contact_phone,
    DROP COLUMN contact_address;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_matched_or_unmatched CHECK (
    (customer_id IS NOT NULL AND property_id IS NOT NULL)
    OR (customer_id IS NULL AND property_id IS NULL AND lead_id IS NOT NULL)
);
