# Environment Variables

Names only. Never commit values. Proposed production hosting is in [ADR 0010](../adr/0010-deployment-and-trust-boundary.md) and is not deployed ([#21](https://github.com/masontuft/routemaster/issues/21)). Supabase as the production database stays Proposed until the instructor confirms it ([#19](https://github.com/masontuft/routemaster/issues/19)).

| Name | Purpose | Read by |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection string. The production plan is the Supabase session pooler. | `src/server.js` (required), `pnpm migrate`, `pnpm seed`, `pnpm link:create`, and the test-database guard |
| `SESSION_SECRET` | Signs the session cookie | `src/server.js` (required) |
| `NODE_ENV` | The session cookie is `Secure` only when this is exactly `production`. Dev reload treats a trimmed, case-folded `production` as production (`src/utils/env.js`). | `src/middleware/session.js` and `src/app.js` |
| `PORT` | Port the server binds. Defaults to 3000. Render sets this. | `src/server.js` |
| `SEED_PASSWORD` | Password for the seeded test accounts. Never commit the real value ([#22](https://github.com/masontuft/routemaster/issues/22)). | `pnpm seed` only |
| `TEST_DATABASE_URL` | Throwaway database for tests. Must differ in host, port, or database name from `DATABASE_URL`. | `src/config/testDatabase.js` only. The server does not read it. |
| `BASE_URL` | Optional host printed by `pnpm link:create`. Defaults to `http://localhost:3000`. | `scripts/create-link.js` only. Not listed in `.env.example`. |
