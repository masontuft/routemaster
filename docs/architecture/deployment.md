# Deployment

Planned per [ADR 0010](../adr/0010-deployment-and-trust-boundary.md). Mason reported on 2026-11-02 that Supabase is set up, `pnpm migrate` has been run, and the Render web service is deployed. `/health` responds through the Supabase session pooler. No URL or service name is recorded here.

| Item | Plan | Verified |
| --- | --- | --- |
| Deployable | One Render web service | Yes. Mason reported on 2026-11-02 that it is deployed and `/health` responds |
| Runtime | Node 24 from `.node-version` | CI installs that file. The Render runtime version was not reported |
| Build and start commands | Build: `corepack enable && pnpm install --frozen-lockfile` ([ADR 0003](../adr/0003-package-manager-pnpm.md)). Start stays `pnpm start` (`node src/server.js`). `render.yaml` runs `pnpm migrate` first, then `pnpm start`. There is no application build step. A deploy exists; the dashboard's exact command string was not copied back | Yes. The service is up |
| Database | Supabase session pooler, port 5432 | Yes. Mason reported on 2026-11-02 that Supabase is set up, `pnpm migrate` has been run, and `/health` responds through the session pooler |
| Port | Bind `0.0.0.0` on `PORT` | Server code binds this way. The live bind was not separately reported |
| Health check | `GET /health` returns 200 when the database answers, or 503 when `SELECT 1` fails | Yes for the live response through the session pooler (Mason, 2026-11-02). The 503 path was tested locally |
| Variables | See [environment variables](../setup/environment-variables.md) | No |

The instructor confirmed on 2026-11-02 that an external Supabase database satisfies "Render with connected PostgreSQL" ([ADR 0007](../adr/0007-persistence-postgres-on-supabase.md)). That database is set up, and the Render service reaches it through the session pooler.
