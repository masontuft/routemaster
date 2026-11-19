-- Pass 2b of ADR 0018. Two changes the request code needs before it can be scoped to a company.
--
-- 1. Each company has its own service catalog. Migration 028 left service_types shared, but the owner edits its names,
--    prices and active flag, so a second company's owner would change the first company's. Every existing row goes to
--    company 1 (Tuft Sprinkler Blowouts) through the column default, the same bridge as migration 028.
--    The name is unique within a company, not across all of them. The old code catches the unique violation and has
--    no ON CONFLICT on this table, so swapping the constraint is safe while the old code is still running.
ALTER TABLE service_types ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies (id) ON DELETE RESTRICT;
CREATE INDEX service_types_company_idx ON service_types (company_id);
ALTER TABLE service_types DROP CONSTRAINT service_types_name_key;
ALTER TABLE service_types ADD CONSTRAINT service_types_company_name_key UNIQUE (company_id, name);

-- 2. A lead is found by company, name, phone and street together. Without the company in the key, the same person at
--    the same address asking company 2 would be given company 1's lead, because ON CONFLICT would find that row.
--    This only ADDS a key. The old three-column key stays for now, because the old code names it in ON CONFLICT and
--    dropping it under live code would fail every public request. The contract migration drops it (issue 75). Until
--    then a second company still cannot hold a lead with the same name, phone and street as the first's.
ALTER TABLE leads ADD CONSTRAINT leads_company_match_key
    UNIQUE (company_id, name_normalized, phone_normalized, address_normalized);
