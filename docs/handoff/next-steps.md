# Next Steps

The Express server, authentication, service requests, staff dashboard, owner admin, reviews, contact, moderation, migrations 001 through 015, and `pnpm seed` are in the repo. CSRF is `csrf-sync`, wired in `src/app.js`. CI (`.github/workflows/ci.yml`) runs a `postgres:16` service. The items below are still open.

## Required

- The Render web service is deployed. Mason reported on 2026-11-02 that `/health` responds through the Supabase session pooler, and that `pnpm migrate` has been run. Resume the Supabase project before grading ([deployment runbook](../operations/deployment-runbook.md)). The Render build command is `corepack enable && pnpm install --frozen-lockfile`. `pnpm start` is `node src/server.js`, and there is no application build step.
- The course ERD image is not in the repo. The schema is migrations 001 through 015 ([#29](https://github.com/masontuft/routemaster/issues/29)). Confirming the public contact email and the course README and commit-count requirements is [issue 30](https://github.com/masontuft/routemaster/issues/30).

## Recommended

- Finish the spreadsheet import on `src/import/`. The owner link page at `/admin/import` lists the tabs with counts. Next are the tab picker, column mapping, preview, and the confirmed write. ExcelJS 4.4.0 and the public export URL are recorded in [ADR 0009](../adr/0009-spreadsheet-import-and-sync.md) ([#33](https://github.com/masontuft/routemaster/issues/33)).
- `connect-pg-simple` imports under ESM and stores sessions in Postgres. CSRF is the `csrf-sync` synchronizer token in `src/middleware/csrf.js`. Both are covered by tests.
- Add the boot smoke test from [ADR 0011](../adr/0011-testing-and-ci.md) (the health check returns 200). The Postgres 16 service container is already in the workflow.

## Optional

- Items in the [roadmap](../product/roadmap.md), including technician logins (planned, not a commitment; technicians do not log in for now), spam control on public forms (planned, not a commitment; not built now, [#36](https://github.com/masontuft/routemaster/issues/36)), and Sprinkler Messenger (parked pending its open questions, [#37](https://github.com/masontuft/routemaster/issues/37)).
- About page copy ([#24](https://github.com/masontuft/routemaster/issues/24)). Real service prices are still the seeded 0 cents ([#23](https://github.com/masontuft/routemaster/issues/23)).
