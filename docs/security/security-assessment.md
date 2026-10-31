# Security Assessment

Scope: the repository. The server is not built. `src/config/testDatabase.js` is implemented and covered by tests. Findings lists the guard's remaining limits and the ESLint advisory. The table below is planned design.

## Data classification

Planned, not built: customer names, phones, addresses and payment records (personal); password hashes; session data. Mason's real spreadsheet holds real customer data and must never be committed.

## Controls (built in segment 3 unless marked)

| Area | Plan |
| --- | --- |
| Authentication | bcrypt hashes, `express-session`, Postgres store ([ADR 0010](../adr/0010-deployment-and-trust-boundary.md)) |
| Access control | Role checks in middleware on every protected route |
| Injection | Parameterized queries only |
| Input | Server-side validation and sanitization; EJS `<%=` escaping |
| Import | Google Sheets URLs only, strict ID pattern, fixed host path, size-limited `.xlsx` uploads ([ADR 0009](../adr/0009-spreadsheet-import-and-sync.md)) |
| Cookies | HttpOnly, Secure in production, SameSite=lax |
| CSRF | `csrf-sync` synchronizer token on every non-GET request; tested |
| Session fixation | Session ID regenerated at register and login; tested |
| Link tokens | 32 random bytes, only the SHA-256 hash stored, expiring and revocable; GET changes nothing; tested |
| Request ownership | Every customer query filters by the session's customer id; another customer's request returns 404; tested |
| Account enumeration | Same message for unknown email and wrong password; tested for the message, not for response timing |

## Open

Dependency audit and secret scanning are not wired. An `express-rate-limit` per-IP limiter (in-memory store) covers login, link redemption and the generic link; it is per instance and resets on restart. Magic links are bearer tokens (ADR 0012). The generic link has no CAPTCHA. Role-protected pages do not exist yet; `requireRole` is unit-tested only. Behavior on Render (Secure cookie behind its proxy) is unverified. See Findings for the test-database guard and the `minimatch` advisory.

## Findings

The test-database guard refuses a missing `TEST_DATABASE_URL`, a value that is not a `postgres://` or `postgresql://` URL, and a URL that names the same host, port, and database as `DATABASE_URL`. User, password, and parameters such as `sslmode` are ignored, so those differences cannot point tests at the real database.

Still open:

- Hostnames are not resolved. `localhost` and `127.0.0.1` count as different servers. Keyword/value connection strings are rejected. See the `TODO (Mason)` in `src/config/testDatabase.js`.
- `pnpm audit` reports [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (`minimatch` before 11.0.1, moderate, dev-only through ESLint). See [dependency management](dependency-management.md).
- Secret scanning is not wired. No committed secret was found in this audit.
