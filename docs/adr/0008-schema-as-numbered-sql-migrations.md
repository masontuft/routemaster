# ADR 0008: How the Schema Is Defined

## Status

Accepted

## Date

2026-10-30

## Context

The course grades database design: related tables, foreign keys, appropriate types and thoughtful CASCADE or SET NULL choices. The schema needs a repeatable way to be created and changed.

## Decision drivers

- Mason should be able to read and defend every statement.
- No new dependency beyond `pg`, since new dependencies need Mason's approval.
- Works against Supabase, a local Postgres and a CI Postgres container alike.

## Decision

Numbered plain SQL files, for example `migrations/001_create_roles.sql`, applied in order by a small runner script that uses `pg` and records applied files in a `schema_migrations` table. Money is stored as integer cents. Parameterized queries are used everywhere in models.

## Alternatives considered

- node-pg-migrate. Migrations are JavaScript with a `pgm.createTable(...)` builder; its page does not mention plain `.sql` files and does not state ESM support. It would add a dev dependency. Not chosen.

## Consequences

- Forward-fix only: there are no automatic down migrations. The rollback runbook must say so.
- The runner is hand-written (`src/db/migrate.js`, `pnpm migrate`) and tested in `src/db/migrate.test.js`.
- Migrations 001 through 016 are the applied schema. Their foreign-key rules are in those files. The unmigrated names in `ARCHITECTURE.md` (`subdivisions`, `routes`, `route_stops`, `payments`, `import_batches`, `import_mappings`) are still a draft.
- The `schema-snapshot` folder and script in `AGENTS.md` are still placeholders ([#39](https://github.com/masontuft/routemaster/issues/39)).
- Technicians do not get logins for now (Mason, 2026-11-02). The dispatcher manages their routes, so the routes tables are not blocked on a technician user account. A technician role is planned, not committed, on the [roadmap](../product/roadmap.md#technician-logins).
- Referral payouts are not tracked in the app (Mason, 2026-11-02). They are handled outside the app. `service_requests.referred_by` records who referred the job, such as Rocky or Skyview. There is no `referral_groups` table.

## References

- node-pg-migrate: https://github.com/salsita/node-pg-migrate
- node-postgres: https://node-postgres.com/features/connecting
