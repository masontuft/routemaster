# Deployment

Planned per [ADR 0010](../adr/0010-deployment-and-trust-boundary.md). The server code exists and the repo is prepared (`render.yaml`, health check, headers). Nothing is deployed ([#21](https://github.com/masontuft/routemaster/issues/21)).

| Item | Plan | Verified |
| --- | --- | --- |
| Deployable | One Render web service | No |
| Runtime | Node 24 from `.node-version` | CI installs that file. Not checked on Render |
| Build and start commands | Build: `corepack enable && pnpm install --frozen-lockfile` ([ADR 0003](../adr/0003-package-manager-pnpm.md)). Start stays `pnpm start` (`node src/server.js`). `render.yaml` runs `pnpm migrate` first, then `pnpm start`. There is no application build step. The first Render build has not been run ([#21](https://github.com/masontuft/routemaster/issues/21)) | No |
| Database | Supabase session pooler, port 5432 | No. Render IPv6 reachability unchecked |
| Port | Bind `0.0.0.0` on `PORT` | Server code binds this way; not tested on Render |
| Health check | `GET /health` returns 200, or 503 when `SELECT 1` fails | Tested locally; not set on Render |
| Variables | See [environment variables](../setup/environment-variables.md) | No |

The instructor confirmed on 2026-11-02 that an external Supabase database satisfies "Render with connected PostgreSQL" ([ADR 0007](../adr/0007-persistence-postgres-on-supabase.md)). Supabase is not deployed ([#21](https://github.com/masontuft/routemaster/issues/21)).
