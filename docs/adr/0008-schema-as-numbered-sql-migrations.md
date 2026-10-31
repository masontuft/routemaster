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
- The runner is hand-written and needs its own test.
- The table list in `ARCHITECTURE.md` is a draft for review, not a decision. Each foreign key's ON DELETE rule is decided when its migration is written.
- The `schema-snapshot` folder and script in `AGENTS.md` are still placeholders.
- Open: do technicians need logins (affects whether routes point at users or a technicians table), and what the Rocky and Skyview referral payout is.
- Nothing is built yet: Not currently implemented.

## References

- node-pg-migrate: https://github.com/salsita/node-pg-migrate
- node-postgres: https://node-postgres.com/features/connecting
