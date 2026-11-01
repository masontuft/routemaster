# Security Assessment

Scope: the repository on the current `main` branch. The Express server is built and covered by tests. It is not deployed. Findings lists the test-database guard's remaining limits and the `minimatch` advisory.

## Data classification

Stored in Postgres: customer names, phones, and addresses; password hashes; session rows; service requests; reviews; contact messages. Payment records are not stored. Mason's real spreadsheet holds real customer data and must never be committed.

## Controls

| Area | What the code does |
| --- | --- |
| Authentication | bcrypt hashes, `express-session`, Postgres store via `connect-pg-simple` ([ADR 0010](../adr/0010-deployment-and-trust-boundary.md)) |
| Access control | `requireRole` on `/admin` (owner), `/staff` (owner and dispatcher), and `/requests` and `/properties` (customer). HTTP tests cover denied cases. Deleting a review is owner-only. |
| Injection | Models use parameterized `pg` queries |
| Input | Server-side validation; EJS `<%=` escaping |
| Import | Not built. Planned: Google Sheets URLs only, strict ID pattern, fixed host path, size-limited `.xlsx` uploads ([ADR 0009](../adr/0009-spreadsheet-import-and-sync.md), [#33](https://github.com/masontuft/routemaster/issues/33)) |
| Cookies | `httpOnly`, `sameSite: "lax"`, and `secure` when `NODE_ENV` is exactly `production` (`src/middleware/session.js`) |
| CSRF | `csrf-sync` synchronizer token. `src/app.js` runs `src/middleware/csrf.js` on every request. The token is read from the `_csrf` field. A post without a token returns 403 in tests. |
| Session fixation | Session ID regenerated at register and login; tested |
| Link tokens | 32 random bytes, only the SHA-256 hash stored, expiring and revocable; GET changes nothing; tested |
| Request ownership | Every customer query filters by the session's customer id; another customer's request returns 404; tested |
| Account enumeration | Same message for unknown email and wrong password; tested for the message, not for response timing |

## Open

Dependency audit and secret scanning are not wired ([#26](https://github.com/masontuft/routemaster/issues/26)). An `express-rate-limit` per-IP limiter (in-memory store) covers login, magic-link redemption, the generic `/schedule` posts, and the contact form. It is per instance and resets on restart. Magic links are bearer tokens (ADR 0012). Reviews, the contact form, and the generic link have no CAPTCHA ([#36](https://github.com/masontuft/routemaster/issues/36)). Behavior on Render (the Secure cookie behind its proxy) is unverified ([#21](https://github.com/masontuft/routemaster/issues/21)). `src/app.js` sets `trust proxy` to 1. See Findings for the test-database guard and the `minimatch` advisory.

## Findings

The test-database guard refuses a missing `TEST_DATABASE_URL`, a value that is not a `postgres://` or `postgresql://` URL, and a URL that names the same host, port, and database as `DATABASE_URL`. User, password, and parameters such as `sslmode` are ignored, so those differences cannot point tests at the real database.

Still open:

- Hostnames are not resolved. `localhost` and `127.0.0.1` count as different servers. Keyword/value connection strings are rejected. See the `TODO (Mason)` in `src/config/testDatabase.js` ([#31](https://github.com/masontuft/routemaster/issues/31)).
- `pnpm audit` reports [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (`minimatch` before 11.0.1, moderate, dev-only through ESLint). See [dependency management](dependency-management.md) and [issue 32](https://github.com/masontuft/routemaster/issues/32).
- Secret scanning is not wired ([#26](https://github.com/masontuft/routemaster/issues/26)).
