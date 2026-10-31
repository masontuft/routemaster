# Local Development

Not currently implemented: there is no `package.json` yet. This page lists what is decided and what is missing.

## Prerequisites

- Node 24 (pinned in `.node-version` once created)
- pnpm (never npm)
- A local PostgreSQL with two databases: one for development and a throwaway one for tests

## Commands

Not decided. The run, lint, test and build commands are added when phase 4 creates the scripts.

## Database

Tests use only the database in `TEST_DATABASE_URL`. See [ADR 0011](../adr/0011-testing-and-ci.md).
