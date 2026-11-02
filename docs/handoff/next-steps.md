# Next Steps

The Express server, authentication, service requests, staff dashboard, owner admin, reviews, contact, moderation, migrations 001 through 014, and `pnpm seed` are in the repo. CSRF is `csrf-sync`, wired in `src/app.js`. CI (`.github/workflows/ci.yml`) runs a `postgres:16` service. The items below are still open.

## Required

- Ask the instructor whether an external Postgres on Supabase satisfies the Render requirement. [ADR 0007](../adr/0007-persistence-postgres-on-supabase.md) stays Proposed ([#19](https://github.com/masontuft/routemaster/issues/19)).
- Nothing is deployed. Render's IPv6 reachability for Supabase is unchecked ([#21](https://github.com/masontuft/routemaster/issues/21)). The Render build command and Corepack choice are open ([#38](https://github.com/masontuft/routemaster/issues/38)). `pnpm start` is `node src/server.js`, and there is no application build step.
- The course ERD image is not in the repo. The schema is migrations 001 through 014 ([#29](https://github.com/masontuft/routemaster/issues/29)). Confirming the public contact email and the course README and commit-count requirements is [issue 30](https://github.com/masontuft/routemaster/issues/30).

## Recommended

- Spike the Google Sheet fetch route and choose the `.xlsx` library. Spreadsheet import is not built ([#33](https://github.com/masontuft/routemaster/issues/33)).
- `connect-pg-simple` imports under ESM and stores sessions in Postgres. CSRF is the `csrf-sync` synchronizer token in `src/middleware/csrf.js`. Both are covered by tests.
- Add the boot smoke test from [ADR 0011](../adr/0011-testing-and-ci.md) (the health check returns 200). The Postgres 16 service container is already in the workflow.

## Optional

- Items in the [roadmap](../product/roadmap.md), including technician logins ([#34](https://github.com/masontuft/routemaster/issues/34)), the Rocky and Skyview referral payout ([#35](https://github.com/masontuft/routemaster/issues/35)), a CAPTCHA or other spam control ([#36](https://github.com/masontuft/routemaster/issues/36)), and Sprinkler Messenger ([#37](https://github.com/masontuft/routemaster/issues/37)).
- About page copy ([#24](https://github.com/masontuft/routemaster/issues/24)). Real service prices are still the seeded 0 cents ([#23](https://github.com/masontuft/routemaster/issues/23)).
