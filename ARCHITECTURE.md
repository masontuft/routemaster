# Architecture

Routemaster is a web app for service companies that builds daily routes and pairs well with Sprinkler Messenger. This file states the answered architecture decisions. Each links to its ADR.

Built in this repo: the Express server, authentication and sessions (including `csrf-sync`), service requests, the staff dashboard, owner admin, reviews, contact and moderation, migrations 001 through 014, `pnpm seed`, the styling in `public/css/`, and CI with a Postgres 16 service. Not built: spreadsheet import, daily routes and route stops, payments, and the About page. Render and Supabase are not deployed. [ADR 0007](docs/adr/0007-persistence-postgres-on-supabase.md) and [ADR 0009](docs/adr/0009-spreadsheet-import-and-sync.md) stay Proposed.

## Decisions

| Area | Decision | ADR |
| --- | --- | --- |
| App type and repo shape | One server-side rendered web app in one repo: a customer-facing site plus staff dashboards for a single company | [0001](docs/adr/0001-app-type-and-repo-shape.md) |
| Stack | Plain JavaScript as ES modules, Node.js 24, Express, EJS | [0002](docs/adr/0002-language-runtime-and-view-engine.md) |
| Package manager | pnpm | [0003](docs/adr/0003-package-manager-pnpm.md) |
| App pattern | Strict MVC: `models/`, `controllers/`, `views/`, with thin `routes/` and `middleware/` | [0004](docs/adr/0004-mvc-app-pattern.md) |
| CSS approach | Native CSS with nesting, cascade layers and `@import`, no build step | [0005](docs/adr/0005-native-css-with-cascade-layers.md) |
| UI style | Base `ui-style-conservative`; marketing pages `ui-style-futuristic`; 404 and error pages `ui-style-over-the-top`; palette `enterprise`; `ui-design-mobile` applies as phone-browser responsiveness only | [0006](docs/adr/0006-ui-style-and-palette.md) |
| Data and persistence | PostgreSQL via `pg`, plain SQL, and `DATABASE_URL`. Supabase is the proposed production host and is not deployed | [0007](docs/adr/0007-persistence-postgres-on-supabase.md) |
| Schema definition | Numbered plain SQL migration files applied by a small runner | [0008](docs/adr/0008-schema-as-numbered-sql-migrations.md) |
| Spreadsheet import | Staged: link or `.xlsx` import with tab picker, column mapping and preview; then export; two-way sync is a stretch goal. Not built | [0009](docs/adr/0009-spreadsheet-import-and-sync.md) |
| Deployment and trust boundary | One Render web service, same origin, Postgres-backed `express-session` cookies, no CORS. Sessions are built; Render is not deployed | [0010](docs/adr/0010-deployment-and-trust-boundary.md) |
| Customer access | Customers schedule by magic link or generic identification link; passwords stay for owner, dispatcher and the graded customer account | [0012](docs/adr/0012-customer-access-by-link.md) |
| Testing and CI | `node:test` and supertest, throwaway test database, Playwright later, GitHub Actions | [0011](docs/adr/0011-testing-and-ci.md) |

## Rule

Any time we add a major feature, there needs to be a test file associated.

Branch names and commit messages are in [CONTRIBUTING.md](CONTRIBUTING.md). Branches are `type/short-description`. This repo also uses `docs/` and `chore/`. The summary line is a short imperative, such as "Add login route".

## Data model

Migrations `001` through `014` create `roles`, `users`, `session`, `customers`, `properties`, `service_types`, `request_statuses`, `service_requests`, `status_history`, `access_links`, `reviews`, and `contact_messages`. Foreign-key delete rules for those tables are in the migration files.

Still a draft, with no migration: `subdivisions`, `routes`, `route_stops`, `payments`, `referral_groups`, `import_batches`, `import_mappings`. Technician logins ([#34](https://github.com/masontuft/routemaster/issues/34)) block the routes tables. The referral payout ([#35](https://github.com/masontuft/routemaster/issues/35)) blocks `referral_groups`. Import tables wait on [issue 33](https://github.com/masontuft/routemaster/issues/33).

## Open items

- Instructor confirmation that an external Postgres on Supabase satisfies the Render requirement ([ADR 0007](docs/adr/0007-persistence-postgres-on-supabase.md), [#19](https://github.com/masontuft/routemaster/issues/19)). This ADR stays Proposed.
- A spike proving how a public Google Sheet is fetched, and the Excel parsing library ([ADR 0009](docs/adr/0009-spreadsheet-import-and-sync.md), [#33](https://github.com/masontuft/routemaster/issues/33)).
- Render's IPv6 reachability for the Supabase connection ([ADR 0010](docs/adr/0010-deployment-and-trust-boundary.md), [#21](https://github.com/masontuft/routemaster/issues/21)). `connect-pg-simple` under ESM and CSRF (`csrf-sync` in `src/middleware/csrf.js`, wired in `src/app.js`) are in the code.
- Whether technicians need logins ([#34](https://github.com/masontuft/routemaster/issues/34)), and what the Rocky and Skyview referral payout is ([#35](https://github.com/masontuft/routemaster/issues/35)).
- The Render build command, and whether that build uses Corepack ([#38](https://github.com/masontuft/routemaster/issues/38)). `pnpm start` runs `node src/server.js`. There is no application build step.
- The schema snapshot folder and script. `AGENTS.md` still names the placeholders `docs/schemas` and `generate schema` ([#39](https://github.com/masontuft/routemaster/issues/39)).

## Roadmap items

Multi-tenant support, import of expenses, mileage and compressor tabs, two-way spreadsheet sync, and an instructor-hosted database as an optional target for server agents. These are recorded in [docs/product/roadmap.md](docs/product/roadmap.md).
