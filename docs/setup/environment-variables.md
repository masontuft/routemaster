# Environment Variables

Names only. Never commit values. Proposed in [ADR 0010](../adr/0010-deployment-and-trust-boundary.md); none are read by code yet.

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Supabase session pooler in production) |
| `SESSION_SECRET` | Signs the session cookie |
| `NODE_ENV` | `production` on Render |
| `PORT` | Port the server binds, set by Render |
| `TEST_DATABASE_URL` | Throwaway database for tests. Must differ from `DATABASE_URL` |
