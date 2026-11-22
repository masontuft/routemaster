# Environment Variables

Names only. Never commit values. Production hosting is in [ADR 0010](../adr/0010-deployment-and-trust-boundary.md). Mason reported on 2026-11-02 that the Render service is deployed. Supabase is the production database ([ADR 0007](../adr/0007-persistence-postgres-on-supabase.md)). The instructor confirmed that on 2026-11-02, `pnpm migrate` has been run, and `/health` responds through the session pooler. No connection string is written here. In production the server refuses to start if `SESSION_SECRET` is shorter than 32 characters or is a placeholder.

| Name | Purpose | Read by |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection string. The production plan is the Supabase session pooler. TLS comes from `sslmode` in the URL. | `src/server.js` (required), `pnpm migrate`, `pnpm seed`, `pnpm link:create`, `pnpm company:create`, and the test-database guard |
| `SESSION_SECRET` | Signs the session cookie. 32+ characters in production | `src/server.js` (required) |
| `PASSWORD_RESET_RESEND_API_KEY` | Optional Resend API key used for password-reset messages. Keep it secret; it is never committed. | `src/server.js` |
| `INVITE_RESEND_API_KEY` | Resend API key used to send staff invitations. Keep it secret; it is never committed. Scope it to the verified domain used by `EMAIL_FROM`. | `src/server.js` |
| `MARKETING_RESEND_API_KEY` | Reserved Resend API key for future marketing email. Not read by the app yet. | Not used yet |
| `MAIN_RESEND_API_KEY` | Reserved general Resend API key. Not read by the app yet. | Not used yet |
| `EMAIL_FROM` | Verified sender used for outbound email. The domain must be authorized for each API key. | `src/server.js` |
| `APP_BASE_URL` | Public app origin used to build password-reset and staff-invitation links. Use the origin only, with no path or trailing slash; production must use HTTPS. | `src/server.js` |
| `NODE_ENV` | The session cookie is `Secure`, and HSTS is sent, only when this is exactly `production`. Dev reload treats a trimmed, case-folded `production` as production (`src/utils/env.js`). | `src/middleware/session.js`, `src/middleware/securityHeaders.js` and `src/app.js` |
| `PORT` | Port the server binds. Defaults to 3000. Render sets this. | `src/server.js` |
| `SEED_PASSWORD` | Password for the seeded test accounts. Never commit the real value ([#22](https://github.com/masontuft/routemaster/issues/22)). | `pnpm seed` only |
| `OWNER_PASSWORD` | The password of the owner that `pnpm company:create` makes. Set it for that one command, for example `OWNER_PASSWORD=... pnpm company:create ...`, and do not keep it in `.env`. It is hashed before it is stored and is never printed. | `pnpm company:create` only |
| `TEST_DATABASE_URL` | Throwaway database for tests. Must differ in host, port, or database name from `DATABASE_URL`. | `src/config/testDatabase.js` only. The server does not read it. |
| `BASE_URL` | Optional host printed by `pnpm link:create`. Defaults to `http://localhost:3000`. | `scripts/create-link.js` only. Not listed in `.env.example`. |
| `GOOGLE_MAPS_API_KEY` | Optional. When set, addresses are looked up with Google first, then OpenStreetMap Nominatim. Without it only Nominatim is used, at one lookup a second. Never commit the value. | `src/server.js` |
| `SERVICE_STATE` | Optional. A state such as `ID`, added to each address before a lookup, because properties store a city and ZIP but no state. | `src/server.js` |
| `ROUTE_START_ADDRESS` | Optional. The address a route starts from, shown as the default on the Route Builder page. Staff can change it for a day. | `src/server.js` |

## Email Provider

Resend is the chosen provider. Password-reset messages use `PASSWORD_RESET_RESEND_API_KEY`; staff invitations use `INVITE_RESEND_API_KEY`. Both use `EMAIL_FROM` and `APP_BASE_URL`. Each sending key must be authorized for the verified domain in the sender address. Invitation links expire after seven days and become unusable when the invitee sets a password. If a send fails after the account is created, the pending row remains on the Users page so the owner can retry after fixing the provider configuration.

Resend's onboarding test sender can send only to the Resend account owner's email address. Keep Resend API keys in the deployment environment or a local, git-ignored `.env`; never commit them.
