-- Pass 2c of ADR 0018. Each company has its own areas, routes and settings, so the names that identify them have to be
-- unique within a company, not across all of them: an area name, the day of a route, and a setting key.
--
-- This only ADDS the per-company keys. The old global keys stay for now, because code that is still running names them
-- in ON CONFLICT (subdivisions.name_normalized in the import, app_settings.key in the settings page of the code live
-- before this change), and dropping a key under live code would fail those statements. The contract migration drops
-- the old keys (issue 75), and then app_settings gets its primary key on (company_id, key).
--
-- Until then a second company still cannot use an area name, a route day or a setting that company 1 already has: the
-- old key refuses it. Nothing is handed across companies, because every query also filters on company_id.
ALTER TABLE subdivisions ADD CONSTRAINT subdivisions_company_name_key UNIQUE (company_id, name_normalized);
ALTER TABLE routes ADD CONSTRAINT routes_company_day_key UNIQUE (company_id, route_day);
ALTER TABLE app_settings ADD CONSTRAINT app_settings_company_key_key UNIQUE (company_id, key);
