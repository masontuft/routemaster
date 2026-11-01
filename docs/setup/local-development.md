# Local Development

Use `pnpm dev` while coding. It restarts the server when files in `src/` or `public/` change, and the open page reloads after the restart. `pnpm start` is the production command: no watch, and it does not load `.env`.

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
pnpm dev
pnpm start
```

- `pnpm dev` runs `node --watch` on `src/server.js`, loads `.env` when that file exists, and sets `NODE_ENV=development` for that process so a production value in `.env` cannot disable the reload. It listens on `PORT` (default 3000), bound to `0.0.0.0`. Pages include a development-only script that polls `/__dev/boot` and reloads the tab when the server process restarts. `pnpm start` and a production `NODE_ENV` omit the script and that route. Production is matched after trim and case-fold, so `Production` or padded values count.
- `pnpm start` runs `node src/server.js` with no watch. Render uses this. It needs `DATABASE_URL` and `SESSION_SECRET` in the process environment.
- There is no build step.
- Create a local `.env` (git-ignored) with `DATABASE_URL`, `TEST_DATABASE_URL` and `SESSION_SECRET`; see `.env.example`. `pnpm dev`, `pnpm migrate`, `pnpm seed`, and `pnpm test` load it with `--env-file`.
- `pnpm migrate` applies new files from `migrations/` to `DATABASE_URL`. Running it twice applies nothing the second time.
- `pnpm seed` creates `owner@example.com`, `dispatcher@example.com` and `customer@example.com` using `SEED_PASSWORD`; running it again skips existing accounts.
- `pnpm link:create <user email or customer id>` prints a magic link for local testing (set `BASE_URL` to change the host).
- The generic scheduling page is `/schedule`.
- CI (`.github/workflows/ci.yml`) runs a frozen install, lint, and test on pull requests and pushes to `main`. The workflow starts a `postgres:16` service and sets `TEST_DATABASE_URL`.

## Database

Tests use only the database in `TEST_DATABASE_URL`. See [ADR 0011](../adr/0011-testing-and-ci.md).
