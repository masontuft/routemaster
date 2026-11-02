# Environment Variables

Names only. Never commit values. Proposed in [ADR 0010](../adr/0010-deployment-and-trust-boundary.md). The test-database guard reads `TEST_DATABASE_URL` and `DATABASE_URL`. The server reads `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV` and `PORT`. In production it refuses to start if `SESSION_SECRET` is shorter than 32 characters or is a placeholder.

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Supabase session pooler in production). TLS comes from `sslmode` in the URL |
| `SESSION_SECRET` | Signs the session cookie |
| `NODE_ENV` | `production` on Render |
| `PORT` | Port the server binds, set by Render |
| `SEED_PASSWORD` | Password for the seeded test accounts, used only by `pnpm seed` |
| `TEST_DATABASE_URL` | Throwaway database for tests. Must differ from `DATABASE_URL` |
