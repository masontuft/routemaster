-- Pass 2d of ADR 0018. The saved column mapping of a spreadsheet tab belongs to a company: two companies can import the
-- same sheet and tab, each with its own mapping. So the key that identifies a mapping includes the company.
--
-- This only ADDS the per-company key. The old (sheet_id, sheet_name) key stays for now, because the code live before
-- this change names it in ON CONFLICT, and dropping it under live code would fail every import. The contract migration
-- drops it (issue 75). Until then a second company cannot save a mapping for a sheet and tab that company 1 already
-- has: the old key refuses it. Nothing is handed across, because every query also filters on company_id.
ALTER TABLE import_mappings ADD CONSTRAINT import_mappings_company_sheet_key UNIQUE (company_id, sheet_id, sheet_name);
