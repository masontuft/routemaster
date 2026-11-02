# Environment Variables

Names only. Never commit values. Production hosting is in [ADR 0010](../adr/0010-deployment-and-trust-boundary.md). Mason reported on 2026-11-02 that the Render service is deployed. Supabase is the production database ([ADR 0007](../adr/0007-persistence-postgres-on-supabase.md)). The instructor confirmed that on 2026-11-02, `pnpm migrate` has been run, and `/health` responds through the session pooler. No connection string is written here. In production the server refuses to start if `SESSION_SECRET` is shorter than 32 characters or is a placeholder.

| Name | Purpose | Read by |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection string. The production plan is the Supabase session pooler. TLS comes from `sslmode` in the URL. | `src/server.js` (required), `pnpm migrate`, `pnpm seed`, `pnpm link:create`, and the test-database guard |
| `SESSION_SECRET` | Signs the session cookie. 32+ characters in production | `src/server.js` (required) |
| `NODE_ENV` | The session cookie is `Secure`, and HSTS is sent, only when this is exactly `production`. Dev reload treats a trimmed, case-folded `production` as production (`src/utils/env.js`). | `src/middleware/session.js`, `src/middleware/securityHeaders.js` and `src/app.js` |
| `PORT` | Port the server binds. Defaults to 3000. Render sets this. | `src/server.js` |
| `SEED_PASSWORD` | Password for the seeded test accounts. Never commit the real value ([#22](https://github.com/masontuft/routemaster/issues/22)). | `pnpm seed` only |
| `TEST_DATABASE_URL` | Throwaway database for tests. Must differ in host, port, or database name from `DATABASE_URL`. | `src/config/testDatabase.js` only. The server does not read it. |
| `BASE_URL` | Optional host printed by `pnpm link:create`. Defaults to `http://localhost:3000`. | `scripts/create-link.js` only. Not listed in `.env.example`. |
