# Changelog

All notable changes are recorded here, following [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added
- `pnpm dev` watches `src/` and `public/` with Node's `--watch` and reloads the open page after the server restarts. The script sets `NODE_ENV=development` so a production value in `.env` cannot disable the reload.
- Staff dashboard for owners and dispatchers: request queue, status transitions with history, Needs Review matching, customer search, and link creation and revocation (migration 012).
- Architecture overview, ADRs 0001 to 0011, and the `docs/` tree.
- Contributing guide, security policy and issue and pull request templates.
- `package.json`, ESLint config, `node:test` runner, the `TEST_DATABASE_URL` guard with tests, and a GitHub Actions CI workflow.

- Customer service requests with status history, properties, magic and generic scheduling links, and rate limiting with express-rate-limit (migrations 004 to 011, ADR 0012).
- Authentication: register, login, logout, Postgres-backed sessions, CSRF protection, role middleware, bcrypt hashing, and `pnpm seed` for test accounts.
- Migration runner (`src/db/migrate.js`, `pnpm migrate`) with `roles` and `users` migrations, tested against the throwaway database; CI gets a Postgres service container.
- Express app skeleton: `src/app.js`, `src/server.js`, `/` and `/health` routes, 404 and error pages, global error handler, and supertest tests.

### Changed
- Testing rule changed from Jest to `node:test`.

### Fixed

- README no longer says the server is unwritten and that `pnpm start` fails.
- `devReload` treats `NODE_ENV` as production after trim and case-fold, so `Production` or padded values do not leave `/__dev/boot` enabled.
- The system context diagram renders on GitHub. Dotted edge labels that contained periods now use the pipe form.
- The test-database guard treats connection strings that name the same host, port, and database as the same database.
- Setup docs that still said `package.json`, `.node-version`, or CI did not exist.

### Security

- A cosmetic difference in `TEST_DATABASE_URL` (scheme, default port, credentials, trailing slash, or an ignored query parameter) can no longer point tests at the real database.
