-- The contract step of ADR 0018 (issue 75). Migrations 028 to 032 only expanded the schema, so the code that was live
-- while each one deployed kept working. The code that is live now sets company_id on every insert and names only the
-- per-company keys in ON CONFLICT, so the bridges can come out. Apply this only after that code is deployed: code from
-- before passes 2a to 2d cannot run against the database once it has been applied.
--
-- 1. No more DEFAULT 1. A query that forgets to set a company now fails with a not-null error, where before it wrote
--    into company 1 without any sign. The existing rows keep their company.
ALTER TABLE users ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE customers ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE leads ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE subdivisions ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE service_requests ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE routes ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE import_batches ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE import_mappings ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE link_batches ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE messenger_batches ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE contact_messages ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE app_settings ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE service_types ALTER COLUMN company_id DROP DEFAULT;

-- 2. The old global keys come out. Each has a per-company key from migrations 029, 031 and 032 that the code already
--    uses, so a second company can now hold the same lead (name, phone and street), area name, route day and import
--    mapping as the first. users.email stays unique across all companies: one login belongs to one company.
ALTER TABLE leads DROP CONSTRAINT leads_name_normalized_phone_normalized_address_normalized_key;
ALTER TABLE subdivisions DROP CONSTRAINT subdivisions_name_normalized_key;
ALTER TABLE routes DROP CONSTRAINT routes_route_day_key;
ALTER TABLE import_mappings DROP CONSTRAINT import_mappings_sheet_id_sheet_name_key;

-- 3. A setting is identified by its company and its key. The primary key moves from (key) to (company_id, key), so the
--    unique key and the plain index that migrations 028 and 031 added for the same columns are no longer needed.
ALTER TABLE app_settings DROP CONSTRAINT app_settings_company_key_key;
ALTER TABLE app_settings DROP CONSTRAINT app_settings_pkey;
ALTER TABLE app_settings ADD PRIMARY KEY (company_id, key);
DROP INDEX app_settings_company_idx;
