# Architecture

Routemaster is a web app for service companies that builds daily routes and pairs well with Sprinkler Messenger. This file states the answered architecture decisions. Each links to its ADR. Nothing described here is built yet: every item is Not currently implemented until the code exists.

## Decisions

| Area | Decision | ADR |
| --- | --- | --- |
| App type and repo shape | One server-side rendered web app in one repo: a customer-facing site plus staff dashboards for a single company | [0001](docs/adr/0001-app-type-and-repo-shape.md) |
| Stack | Plain JavaScript as ES modules, Node.js 24, Express, EJS | [0002](docs/adr/0002-language-runtime-and-view-engine.md) |
| Package manager | pnpm | [0003](docs/adr/0003-package-manager-pnpm.md) |
| App pattern | Strict MVC: `models/`, `controllers/`, `views/`, with thin `routes/` and `middleware/` | [0004](docs/adr/0004-mvc-app-pattern.md) |
| CSS approach | Native CSS with nesting, cascade layers and `@import`, no build step | [0005](docs/adr/0005-native-css-with-cascade-layers.md) |
| UI style | Base `ui-style-conservative`; marketing pages `ui-style-futuristic`; 404 and error pages `ui-style-over-the-top`; palette `enterprise`; `ui-design-mobile` applies as phone-browser responsiveness only | [0006](docs/adr/0006-ui-style-and-palette.md) |
| Data and persistence | PostgreSQL on Supabase, vendor-neutral (`pg`, plain SQL, `DATABASE_URL`) | [0007](docs/adr/0007-persistence-postgres-on-supabase.md) |
| Schema definition | Numbered plain SQL migration files applied by a small runner | [0008](docs/adr/0008-schema-as-numbered-sql-migrations.md) |
| Spreadsheet import | Staged: link or `.xlsx` import with tab picker, column mapping and preview; then export; two-way sync is a stretch goal | [0009](docs/adr/0009-spreadsheet-import-and-sync.md) |
| Deployment and trust boundary | One Render web service, same origin, Postgres-backed `express-session` cookies, no CORS | [0010](docs/adr/0010-deployment-and-trust-boundary.md) |
| Testing and CI | `node:test` and supertest, throwaway test database, Playwright later, GitHub Actions | [0011](docs/adr/0011-testing-and-ci.md) |

## Rule

Any time we add a major feature, there needs to be a test file associated.

## Draft data model

This is a proposal for review, not a decision. Each foreign key's ON DELETE rule is decided when its migration is written.

`roles`, `users`, `customers`, `subdivisions`, `properties`, `service_types`, `service_requests`, `request_statuses`, `status_history`, `routes`, `route_stops`, `payments`, `reviews`, `contact_messages`, `referral_groups`, `import_batches`, `import_mappings`.

## Open items

- Instructor confirmation that an external Postgres on Supabase satisfies the Render requirement (ADR 0007).
- A spike proving how a public Google Sheet is fetched, and the Excel parsing library (ADR 0009).
- Whether `connect-pg-simple` imports cleanly in ESM, and the CSRF approach (ADR 0010).
- Whether technicians need logins, and what the Rocky and Skyview referral payout is.
- Build and start commands, the schema snapshot folder and script, and the branch and commit conventions for `CONTRIBUTING.md`.

## Roadmap items

Multi-tenant support, import of expenses, mileage and compressor tabs, two-way spreadsheet sync, and an instructor-hosted database as an optional target for server agents. These are recorded in `docs/product/roadmap.md` in the next phase.
