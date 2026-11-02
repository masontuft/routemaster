# Deployment Runbook

Nothing is deployed. Decided: one Render web service, Supabase database, variables from [environment variables](../setup/environment-variables.md). Steps below are unverified.

1. Create the Render web service from the repo; choose Node 24.
2. Set the variables in the Render dashboard.
3. Run `pnpm migrate` against the production database. The runner exists (`src/db/migrate.js`). Running it against production is unverified.
4. Set the health check path.
5. Deploy and confirm the health check returns 200.

Common failures: Supabase IPv6-only direct connection (use the session pooler); missing `SESSION_SECRET`; the Render build command for pnpm is undecided ([#38](https://github.com/masontuft/routemaster/issues/38)). The deploy itself is [issue 21](https://github.com/masontuft/routemaster/issues/21).
