-- A lead made into a customer holds the name, phone and street that person typed, so it goes when the customer does.
-- Migration 025 used SET NULL, which kept those details after the customer was deleted. CASCADE removes the lead.
-- Requests keep ON DELETE for lead_id as SET NULL, not CASCADE: a lead can have requests that were matched to a
-- different customer (a person who moved, or two customers a lead was matched to by hand), and deleting one customer
-- must not delete another's request. An unmatched request has no customer and needs its lead, so SET NULL would break
-- the CHECK on it. The code that deletes customers (src/models/customer.js) removes those requests first; a delete
-- path that forgets fails on the CHECK instead of keeping the typed details.
ALTER TABLE leads DROP CONSTRAINT leads_customer_id_fkey;
ALTER TABLE leads ADD CONSTRAINT leads_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE;

ALTER TABLE service_requests DROP CONSTRAINT service_requests_lead_id_fkey;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE SET NULL;
