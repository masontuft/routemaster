# Deployment

Planned per [ADR 0010](../adr/0010-deployment-and-trust-boundary.md). The server code exists. Nothing is deployed ([#21](https://github.com/masontuft/routemaster/issues/21)).

| Item | Plan | Verified |
| --- | --- | --- |
| Deployable | One Render web service | No |
| Runtime | Node 24 from `.node-version` | CI installs that file. Not checked on Render |
| Build and start commands | `pnpm start` is `node src/server.js`. There is no application build step. The Render build command and Corepack choice are open ([#38](https://github.com/masontuft/routemaster/issues/38)) | No |
| Database | Supabase session pooler, port 5432 | No. Render IPv6 reachability unchecked |
| Port | Bind `0.0.0.0` on `PORT` | Server code binds this way; not tested on Render |
| Health check | `GET /health` returns 200 | Works locally; not set on Render |
| Variables | See [environment variables](../setup/environment-variables.md) | No |

Open: the instructor must confirm an external Supabase database satisfies "Render with connected PostgreSQL" ([#19](https://github.com/masontuft/routemaster/issues/19)). ADR 0007 stays Proposed.
