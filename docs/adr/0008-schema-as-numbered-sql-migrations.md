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
- Migrations 001 through 014 are the applied schema. Their foreign-key rules are in those files. The unmigrated names in `ARCHITECTURE.md` (`subdivisions`, `routes`, `route_stops`, `payments`, `referral_groups`, `import_batches`, `import_mappings`) are still a draft.
- The `schema-snapshot` folder and script in `AGENTS.md` are still placeholders ([#39](https://github.com/masontuft/routemaster/issues/39)).
- Open: do technicians need logins (affects whether routes point at users or a technicians table, [#34](https://github.com/masontuft/routemaster/issues/34)), and what the Rocky and Skyview referral payout is ([#35](https://github.com/masontuft/routemaster/issues/35)).

## References

- node-pg-migrate: https://github.com/salsita/node-pg-migrate
- node-postgres: https://node-postgres.com/features/connecting
