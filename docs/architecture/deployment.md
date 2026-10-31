# Deployment

Proposed per [ADR 0010](../adr/0010-deployment-and-trust-boundary.md). Not currently implemented.

| Item | Plan | Verified |
| --- | --- | --- |
| Deployable | One Render web service | No |
| Runtime | Node 24 from `.node-version` | No |
| Build and start commands | Not decided. pnpm on Render has worked for Mason before, but the Corepack question is open | No |
| Database | Supabase session pooler, port 5432 | No. Render IPv6 reachability unchecked |
| Port | Bind `0.0.0.0` on `PORT` | No |
| Health check | A path returning 200 | No |
| Variables | See [environment variables](../setup/environment-variables.md) | No |

Open: the instructor must confirm an external Supabase database satisfies "Render with connected PostgreSQL".
