# ADR 0007: Persistence

## Status

Proposed. One open item: Mason will confirm with his instructor that an external Postgres on Supabase satisfies the course requirement for a Render deployment with a connected PostgreSQL database.

## Date

2026-10-30

## Context

The course requires PostgreSQL, deployed on Render with the database connected. This semester Mason's instructor offers hosted databases, but Mason will need to migrate off them after the class. Mason chose to start on Supabase.

## Decision drivers

- Avoid migrating the data twice.
- Keep a later move between hosts cheap.
- Do not risk the graded deployment.

## Decision

- Store: PostgreSQL, hosted on Supabase.
- Stay vendor-neutral: `pg` (node-postgres) with a `DATABASE_URL` connection string, plain SQL, no Supabase client library, no Supabase webhooks and no reliance on row-level security. Moving hosts is then a `pg_dump` and restore plus one environment variable.
- Connect through Supabase's session pooler on port 5432 unless Render's IPv6 reachability is verified. Supabase's direct connection is IPv6-only on the free and Pro plans, and the session pooler is IPv4 on every plan.
- Data enters through the spreadsheet import (ADR 0009) and the application's own forms.

## Alternatives considered

- Render Postgres. Render recommends its internal URL for services in the same region. The page did not state a free-tier expiry, so that was not confirmed. Not chosen.
- The instructor's hosted database. Remains a roadmap option, including as a test or development target for server agents that cannot reach Mason's local Postgres.

## Consequences

- Supabase's free plan allows 500 MB per project.
- Supabase's pricing page, as summarized in search results, says free projects pause after one week of inactivity. A paused project can be restored from the dashboard within a one-year window per the pausing guide. Neither page was opened in full. Use the database in the days before grading, and put "resume project" in the deployment runbook.
- Open item: the instructor's confirmation. Until then this ADR stays Proposed.
- Nothing is built yet: Not currently implemented.

## References

- Supabase connecting to Postgres: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase billing (500 MB limit): https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase pricing: https://supabase.com/pricing
- Supabase project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Render Postgres: https://render.com/docs/postgresql-creating-connecting
- node-postgres: https://node-postgres.com/features/connecting
