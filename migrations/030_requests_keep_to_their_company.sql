-- Pass 2b-ii of ADR 0018. A request points at a customer and at a lead by (id, company_id), not by id alone, so a request
-- in one company cannot reference a customer or a lead in another, even if a query has a bug. The code already checks
-- this (src/models/serviceRequest.js); this makes the database refuse it too.
--
-- A foreign key may only target columns that are unique together, so customers and leads get a unique (id, company_id).
-- id is already the primary key, so this adds no new restriction on the data: it only gives the foreign key a target.
--
-- The foreign keys keep the behavior they had:
--   customer  ON DELETE CASCADE. Deleting a customer deletes their requests.
--   lead      ON DELETE SET NULL (lead_id), as migration 027 set. Only lead_id is cleared, not company_id, which is NOT NULL.
--             This column-list form needs Postgres 15 or later; the production database runs 17.
-- A request with no customer or no lead (the column is NULL) is not checked for that side, as before.
--
-- Safe with the code that is running while this deploys: every row is in company 1 until a second company exists, so a
-- request and its customer or lead are always in the same company.
ALTER TABLE customers ADD CONSTRAINT customers_id_company_key UNIQUE (id, company_id);
ALTER TABLE leads ADD CONSTRAINT leads_id_company_key UNIQUE (id, company_id);

ALTER TABLE service_requests DROP CONSTRAINT service_requests_customer_id_fkey;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_customer_company_fkey
    FOREIGN KEY (customer_id, company_id) REFERENCES customers (id, company_id) ON DELETE CASCADE;

ALTER TABLE service_requests DROP CONSTRAINT service_requests_lead_id_fkey;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_lead_company_fkey
    FOREIGN KEY (lead_id, company_id) REFERENCES leads (id, company_id) ON DELETE SET NULL (lead_id);
