---
name: migrate-both-databases
description: Use when a migration is added, merged or pulled, or when production is migrated, so the test database never falls behind the schema.
---

# Migrate both databases

A migration is not applied until it has run against the test database and against production. The automated tests do not do this for you: each test file migrates a throwaway schema inside `routemaster_test` and drops it. The test database's own `public` schema, which the `routemaster-test` dev server on port 3100 and any hand-testing read, is never touched by `pnpm test`. When it falls behind, pages that read the new columns return a 500. This happened on 2026-11-23 when migrations 025 through 034 had never been applied to it.

1. **Test database first, then production.** A migration that fails on a database with real rows fails on the test database too, so the cheap copy finds the problem before the real one does. Run `pnpm migrate:test`. It applies new migrations to the database named by `TEST_DATABASE_URL` and refuses to run if that is `DATABASE_URL`.
2. **Then production, with Mason's say-so.** `pnpm migrate` against `DATABASE_URL` is a hand run only when Mason asks for one. Otherwise Render runs it at deploy (`pnpm migrate && pnpm start` in `render.yaml`). Never run it yourself without his word. Read `docs/adr/0018-companies-and-company-scoped-data.md` before a migration that makes the old code fail, since a deploy runs the migration before the new code starts.
3. **Run `pnpm migrate:test` in each of these cases, not only when you write a migration:** you add one, you pull or merge a branch that brings one, or Mason says production was migrated. Run it again and expect "Nothing to apply to the test database." That second line is the check.
4. **Look at the data the migration touched.** A new `NOT NULL` column with no default leaves existing test rows empty or failing, and accounts made by a local helper script (such as a debug login) may need to be made again. The debug login for the built-in browser lost its `company_id` this way.
5. **Say what you could not do.** Server and cloud agents cannot reach Mason's local Postgres. Write it under "Open / next" in the ledger so the next local agent runs `pnpm migrate:test`.

The script name, the environment variable and the production command differ per project, so confirm them with Mason before relying on them. The real values for this repo are in `AGENTS.md`.

> "make sure that when doing production migrations we also run test DB migrations"
