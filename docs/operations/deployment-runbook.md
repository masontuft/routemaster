# Deployment Runbook

Nothing is deployed. Decided: one Render web service, Supabase database, variables from [environment variables](../setup/environment-variables.md). Steps below are unverified.

1. Create the Render web service from the repo; choose Node 24.
2. Set the variables in the Render dashboard.
3. Run the migrations against the production database (runner not built).
4. Set the health check path.
5. Deploy and confirm the health check returns 200.

Common failures: Supabase IPv6-only direct connection (use the session pooler); missing `SESSION_SECRET`; build command for pnpm undecided.
