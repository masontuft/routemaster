# Deployment

Proposed per [ADR 0010](../adr/0010-deployment-and-trust-boundary.md). The repo is prepared; nothing is deployed.

| Item | Plan | Verified |
| --- | --- | --- |
| Deployable | One Render web service | No |
| Runtime | Node 24 from `.node-version` | No |
| Build and start commands | In `render.yaml`: `corepack enable && pnpm install --frozen-lockfile`, then `pnpm migrate && pnpm start`. Corepack on Render is unconfirmed | No |
| Database | Supabase session pooler, port 5432 | No. Render IPv6 reachability unchecked |
| Port | Bind `0.0.0.0` on `PORT` | Server code binds this way; not tested on Render |
| Health check | `GET /health` returns 200, or 503 when `SELECT 1` fails | Tested locally; not set on Render |
| Variables | See [environment variables](../setup/environment-variables.md) | No |

Open: the instructor must confirm an external Supabase database satisfies "Render with connected PostgreSQL".
