# Local Development

The app code is not written yet, but the tooling exists: `package.json`, ESLint and `node:test`.

## Prerequisites

- Node 24 (pinned in `.node-version` once created)
- pnpm (never npm)
- A local PostgreSQL with two databases: one for development and a throwaway one for tests

## Commands

```bash
pnpm install
pnpm lint
pnpm test
pnpm start
```

- `pnpm start` runs `node src/server.js` and listens on `PORT` (default 3000), bound to `0.0.0.0`. Routes so far: `/`, `/health`, and a 404 page.
- There is no build step. Boot smoke testing arrives with the server.
- CI (`.github/workflows/ci.yml`) runs a frozen install, lint and test. It has not run on GitHub yet.

## Database

Tests use only the database in `TEST_DATABASE_URL`. See [ADR 0011](../adr/0011-testing-and-ci.md).
