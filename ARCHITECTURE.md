# Architecture

Routemaster is a web app for service companies that builds daily routes and pairs well with Sprinkler Messenger. This file states the answered architecture decisions. Each links to its ADR.

Built in this repo: the Express server, authentication and sessions (including `csrf-sync`), service requests, the staff dashboard, owner admin, reviews, contact and moderation, migrations 001 through 016, `pnpm seed`, the styling in `public/css/`, CI with a Postgres 16 service, and the spreadsheet import from a public Google Sheet link (tab list, column mapping, preview, and a confirmed write) in `src/import/`. Not built: spreadsheet upload, the per-value status picker, daily routes and route stops, payments, and the About page. Mason reported on 2026-11-02 that Supabase is set up, `pnpm migrate` has been run, and the Render web service is deployed with `/health` responding through the session pooler. [ADR 0007](docs/adr/0007-persistence-postgres-on-supabase.md), [ADR 0009](docs/adr/0009-spreadsheet-import-and-sync.md), and [ADR 0010](docs/adr/0010-deployment-and-trust-boundary.md) are Accepted.

## Decisions

| Area | Decision | ADR |
| --- | --- | --- |
| App type and repo shape | One server-side rendered web app in one repo: a customer-facing site plus staff dashboards for a single company | [0001](docs/adr/0001-app-type-and-repo-shape.md) |
| Stack | Plain JavaScript as ES modules, Node.js 24, Express, EJS | [0002](docs/adr/0002-language-runtime-and-view-engine.md) |
| Package manager | pnpm | [0003](docs/adr/0003-package-manager-pnpm.md) |
| App pattern | Strict MVC: `models/`, `controllers/`, `views/`, with thin `routes/` and `middleware/` | [0004](docs/adr/0004-mvc-app-pattern.md) |
| CSS approach | Native CSS with nesting, cascade layers and `@import`, no build step | [0005](docs/adr/0005-native-css-with-cascade-layers.md) |
| UI style | Base `ui-style-conservative`; marketing pages `ui-style-futuristic`; 404 and error pages `ui-style-over-the-top`; palette `enterprise` (settled: deep blue, white, bubblegum pink); `ui-design-mobile` applies as phone-browser responsiveness only | [0006](docs/adr/0006-ui-style-and-palette.md) |
| Data and persistence | PostgreSQL via `pg`, plain SQL, and `DATABASE_URL`. Supabase is the production host. The instructor confirmed on 2026-11-02 that this satisfies the course. `pnpm migrate` has been run, and `/health` responds through the session pooler | [0007](docs/adr/0007-persistence-postgres-on-supabase.md) |
| Schema definition | Numbered plain SQL migration files applied by a small runner | [0008](docs/adr/0008-schema-as-numbered-sql-migrations.md) |
| Spreadsheet import | Staged: link or `.xlsx` import with tab picker, column mapping and preview; then export; two-way sync is a stretch goal. ExcelJS 4.4.0. Link import is built end to end; upload and export are not | [0009](docs/adr/0009-spreadsheet-import-and-sync.md) |
| Deployment and trust boundary | One Render web service, same origin, Postgres-backed `express-session` cookies, no CORS. The service is deployed. `/health` responds through the Supabase session pooler | [0010](docs/adr/0010-deployment-and-trust-boundary.md) |
| Customer access | Customers schedule by magic link or generic identification link; passwords stay for owner, dispatcher and the graded customer account | [0012](docs/adr/0012-customer-access-by-link.md) |
| Testing and CI | `node:test` and supertest, throwaway test database, Playwright later, GitHub Actions | [0011](docs/adr/0011-testing-and-ci.md) |

## Rule

Any time we add a major feature, there needs to be a test file associated.

Branch names and commit messages are in [CONTRIBUTING.md](CONTRIBUTING.md). Branches are `type/short-description`. This repo also uses `docs/` and `chore/`. The summary line is a short imperative, such as "Add login route".

## Data model

Migrations `001` through `015` create `roles`, `users`, `session`, `customers`, `properties`, `service_types`, `request_statuses`, `service_requests`, `status_history`, `access_links`, `reviews`, and `contact_messages`. Migration 015 adds `service_requests.referred_by`, the name of who referred the job. Referral payouts are handled outside the app. Foreign-key delete rules for those tables are in the migration files.

Migration 016 added `import_batches`, `import_mappings`, `subdivisions`, `properties.subdivision_id`, `service_requests.amount_cents`, and an `import_batch_id` on customers, properties and service requests. Still a draft, with no migration: `routes`, `route_stops`, `payments`. Technicians do not get logins for now, and the dispatcher manages their routes, so technician logins do not block the routes tables. A technician role is on the [roadmap](docs/product/roadmap.md#technician-logins). The import is in `src/import/` ([#33](https://github.com/masontuft/routemaster/issues/33)).

## Open items

- The schema snapshot folder and script. `AGENTS.md` still names the placeholders `docs/schemas` and `generate schema` ([#39](https://github.com/masontuft/routemaster/issues/39)).

## Roadmap items

Branded business workspaces (multi-tenant), technician logins, spam control on public forms, import of expenses, mileage and compressor tabs, two-way spreadsheet sync, and an instructor-hosted database as an optional target for server agents. These are recorded in [docs/product/roadmap.md](docs/product/roadmap.md).
