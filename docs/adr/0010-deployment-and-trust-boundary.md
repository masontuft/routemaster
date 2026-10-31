# ADR 0010: Deployment and Trust Boundary

## Status

Proposed. Open items: whether `connect-pg-simple` imports cleanly in ESM, the CSRF approach, and Render's IPv6 reachability for the Supabase connection.

## Date

2026-10-30

## Context

The course requires a Render deployment with the database connected, environment variables configured, and no development-only code in production. It also requires session-based authentication with a secure session configuration.

## Decision drivers

- One deployable.
- Render terminates TLS, so Express needs to know it is behind a proxy.
- The default session store is not allowed in production.

## Decision

- One Render web service serving the server-rendered pages and static files, plus the Supabase database. The service binds `0.0.0.0` on the `PORT` variable and exposes a health check path.
- Same origin: no CORS middleware.
- Trust boundary: browser to Render over TLS, then Render to Supabase over TLS. Additional inbound paths are admin-supplied Google links and uploaded files (ADR 0009).
- Authentication: `express-session`. Cookie `HttpOnly` (the default), `Secure` in production, `SameSite=lax`, secret from the environment, `resave` and `saveUninitialized` false, and `app.set('trust proxy', 1)`. Sessions are stored in Postgres.
- Authorization: role checks in middleware on every protected route.
- Environment variables: `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`, `PORT`, and `TEST_DATABASE_URL` for tests. Names go in `.env.example`, never values.

## Alternatives considered

- The default `MemoryStore`. The express-session README says it is purposely not designed for production and leaks memory.
- Trusting more proxies than one. The Express guide warns that over-trusting lets clients spoof their IP or protocol.

## Consequences

- `connect-pg-simple` takes a `pg.Pool` and can create its table from a provided SQL file. Its page shows only `require()` examples and a CJS badge, so ESM use is unconfirmed and has to be tested. It would be a dependency Mason approves first.
- CSRF protection is needed for cookie sessions and is not yet researched.
- Nothing is built yet: Not currently implemented.

## References

- Render web services: https://render.com/docs/web-services
- Express behind proxies: https://expressjs.com/en/guide/behind-proxies.html
- express-session: https://github.com/expressjs/session
- connect-pg-simple: https://github.com/voxpelli/node-connect-pg-simple
