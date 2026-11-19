# ADR 0018: Companies and Company-Scoped Data

## Status

Proposed. Mason chose this design on 2026-11-18. Only the first step is built (migration 028, which adds the `companies` table and the `company_id` columns). It stays Proposed until the models, the public pages and the isolation tests are built and Mason has looked at them. It changes the "single company" decision in [ADR 0001](0001-app-type-and-repo-shape.md). It does not change [ADR 0007](0007-persistence-postgres-on-supabase.md) or [ADR 0010](0010-deployment-and-trust-boundary.md): there is still one database and one Render service.

## Date

2026-11-18

## Context

Routemaster was built for one company. The roadmap's [Branded Business Workspaces](../product/roadmap.md#branded-business-workspaces) plan lets another service company use the app under its own name, with its customers and requests kept apart from every other business's. That plan has two parts that can be built separately: keeping each business's data apart, and showing each business's own branding. This ADR is the first part only. Branding, a public business sign-up, plans and pricing, a subdomain, and an operator role above company owners are not decided here and stay on the roadmap.

The roadmap listed three ways to keep data apart as open: a tenant column on shared tables, a schema per business, and a database per business. Mason chose separation by company rows in shared tables on 2026-11-18. He called the unit a "company", so the code and database say company, and the roadmap's word "workspace" means the same thing.

## Decision drivers

- One repository, one Render service, one Supabase database (ADR 0007 and ADR 0010), as the course grades.
- Numbered SQL migrations in one folder (ADR 0008), run once per deploy.
- A deploy runs `pnpm migrate` before the new code starts, so a migration has to work with the old code for a moment (the same constraint as [ADR 0017](0017-leads-for-unmatched-visitors.md)).
- The existing data must keep working without a manual step.
- A mistake that lets one company see another's data is a security failure, so the design has to make the mistake loud, not quiet.

## Decision

- **A `companies` table** with `id`, `name`, `slug` and `created_at`. The slug is lower-case words joined by hyphens, at most 40 characters, and unique. It will be part of a company's public address later (`/w/<slug>/schedule`). Nothing reads it yet.
- **A `company_id` column on the tables that hold one company's data:** `users`, `customers`, `leads`, `subdivisions`, `service_requests`, `routes`, `import_batches`, `import_mappings`, `link_batches`, `messenger_batches`, `contact_messages` and `app_settings`. The foreign key is `ON DELETE RESTRICT`, so a company that still has data cannot be deleted by mistake.
- **Child tables have no column of their own.** `properties`, `access_links`, `area_days`, `route_stops`, `reviews`, `status_history` and `messenger_batch_recipients` belong to a parent that has one, and are reached through it.
- **Shared by every company:** `roles` and `request_statuses`. `service_types` was shared too, until migration 029 gave each company its own catalog, because the owner edits its names and prices.
- **Company 1 is the existing business.** Migration 028 inserts it with an explicit id, the name "Tuft Sprinkler Blowouts" and the slug `tuft-sprinkler-blowouts` (named by Mason, 2026-11-18). Every existing row belongs to it, because the column's default fills the rows that were there before.
- **Expand now, contract later.** Migration 028 adds the columns as `NOT NULL DEFAULT 1`. A constant default fills existing rows without rewriting the tables, and the old code's inserts, which do not know about `company_id`, keep working during a deploy. Migration 028 changes no existing constraint, because some code names its constraint in `ON CONFLICT` (`app_settings.key`, `import_mappings`, `subdivisions.name_normalized` and `leads`), and changing the constraint under live code would fail those inserts.
- **A later migration contracts.** It ships with the code that sets `company_id` on every insert and filters on it on every read. It drops the `DEFAULT 1`, and it makes the unique keys per company: area name, route day, the lead match key, setting key and import mapping. Until then the default is a bridge: a query that forgets to set a company writes into company 1 without an error. That is the main risk of this step, and the reason it is not left in place.
- **A company comes from the login or the address.** Staff get it from their user row, a customer link gets it from the customer, a Messenger batch token gets it from the batch row, and a public page gets it from the slug. It is never read from a form field. `users.email` stays unique across all companies, so one login belongs to one company.

## Alternatives considered

- **A schema per business.** Rejected: every new company would need the migrations run against its own schema, which does not fit one migration folder run once per deploy, and the session store and pool would need to switch schemas per request.
- **A database per business.** Rejected: ADR 0007 and ADR 0010 are one database, and the course grades one.
- **Postgres row-level security.** Not chosen now. It guards against a forgotten filter, but it needs the company set on the database session for every request, which does not fit the shared `pg` pool and session store without more work. It can be added on top later.
- **Composite foreign keys on `(id, company_id)`**, so a request in one company cannot point at a customer or lead in another. Built for `service_requests` in migration 030 (Mason, 2026-11-19): customer is `ON DELETE CASCADE`, and lead is `ON DELETE SET NULL (lead_id)`, a form that needs Postgres 15 or later (the Supabase project runs 17.11). Not built for the other links: a request's property and service type, a lead's customer, and the rest. The code checks those, and the foreign keys can be extended the same way.
- **Adding `company_id` and making it `NOT NULL` with no default in one migration.** Rejected: the old code is still running for a moment after `pnpm migrate`, and its inserts would fail.
- **Calling the unit "workspace".** Rejected by Mason's wording. "Company" matches the rest of the code, where `app_settings` is described as company-wide.

## Consequences

- Nothing changes for the current business or its customers. Passes 2a, 2b and 2c are built: the session carries the company, and customers, properties, the admin users page, requests, the staff queue, matching, leads, reviews, the service catalog, areas and their days, routes, settings, rebooking and the day board are scoped, with their staff pages, the bulk delete, the import lookups, link redeem and the public form. Migration 029 gives each company its own service catalog and adds a per-company lead key; migration 030 makes a request's customer and lead keys include the company; migration 031 adds per-company keys for area names, route days and setting keys. The app still behaves as one company, because company 1 is the only one.
- Until the contract migration, the database does not stop a second company's rows from colliding with the first's: two companies could not both have an area called "Oak Park" or a route for the same day. That is why a second company cannot be created yet.
- Still not company-aware, and named so they are not forgotten: import apply (it writes customers, properties, areas and requests, so a second company's import would land in company 1), import batches and mappings, link batches, Messenger batches and the Messenger API token path, and contact messages (pass 2d). The link batch and Messenger batch pages look an area up with the scoped `Area` functions, but the batches they make are not scoped yet. The public `/reviews`, `/services`, `/register` and `/schedule` use the first company until the `/w/<slug>` pages exist. Until the contract migration drops `DEFAULT 1` and the old global keys (lead key, area name, route day, setting key), anything left unscoped writes into company 1, and a second company cannot use a lead, an area name, a route day or a setting that company 1 already has: the old key refuses it, and nothing is handed across.
- `src/db/migrate.test.js` checks that existing rows land in company 1, that the next company is 2, that an insert without a company goes to company 1, and that the slug and foreign key rules hold.
- Not tested against the live database. The migration should be dry-run against a copy of production before the deploy, since it adds a column and an index to every large table.
- The FigJam copy of the ERD is out of date. Nothing updates it.

## References

- `migrations/028_create_companies.sql`, `src/db/migrate.test.js`.
- Pass 2c: `migrations/031_company_area_route_setting_keys.sql`, `src/models/area.js`, `routePlan.js`, `appSetting.js`, `rebooking.js`, `dayBoard.js`.
- Pass 2b: `migrations/029_company_service_types_and_lead_key.sql`, `migrations/030_requests_keep_to_their_company.sql`, `src/models/staff.js`, `serviceRequest.js`, `lead.js`, `review.js`, `serviceType.js`.
- Pass 2a: `src/config/company.js`, `src/utils/company.js`, `src/middleware/ensureCompany.js`, `src/models/customer.js`, `src/models/property.js`. Tests: `src/companyIsolation.test.js`, `src/middleware/ensureCompany.test.js`.
- [Roadmap: Branded Business Workspaces](../product/roadmap.md#branded-business-workspaces).
- [ADR 0001](0001-app-type-and-repo-shape.md), [ADR 0007](0007-persistence-postgres-on-supabase.md), [ADR 0008](0008-schema-as-numbered-sql-migrations.md), [ADR 0010](0010-deployment-and-trust-boundary.md), [ADR 0017](0017-leads-for-unmatched-visitors.md).
- [Database ERD](../architecture/database-erd.md).
