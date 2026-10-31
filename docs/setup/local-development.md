# Local Development

The server is not written yet. Tooling exists (`package.json`, ESLint, and `node:test`), and the test-database guard is in `src/config/testDatabase.js`.

## Prerequisites

- Node 24 (pinned in `.node-version`)
- pnpm (never npm)
- A local PostgreSQL with two databases: one for development and a throwaway one for tests

## Commands

```bash
createdb routemaster
createdb routemaster_test
pnpm install
pnpm migrate
pnpm seed
pnpm lint
pnpm test
pnpm start
```

- `pnpm start` runs `node src/server.js` and listens on `PORT` (default 3000), bound to `0.0.0.0`. Routes so far: `/`, `/health`, and a 404 page.
- There is no build step. Boot smoke testing arrives with the server.
- Create a local `.env` (git-ignored) with `DATABASE_URL`, `TEST_DATABASE_URL` and `SESSION_SECRET`; see `.env.example`. `pnpm migrate` and `pnpm test` load it with `--env-file`.
- `pnpm migrate` applies new files from `migrations/` to `DATABASE_URL`. Running it twice applies nothing the second time.
- `pnpm seed` creates `owner@example.com`, `dispatcher@example.com` and `customer@example.com` using `SEED_PASSWORD`; running it again skips existing accounts. `pnpm start` needs `DATABASE_URL` and `SESSION_SECRET`.
- CI (`.github/workflows/ci.yml`) runs a frozen install, lint, and test on pull requests and pushes to `main`.

## Database

Tests use only the database in `TEST_DATABASE_URL`. See [ADR 0011](../adr/0011-testing-and-ci.md).
