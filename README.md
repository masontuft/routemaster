# Routemaster

Web app for service companies that builds daily routes and pairs well with Sprinkler Messenger. It is Mason's CSE 340 final project (Option A, design your own).

**Status:** in development. The Express app, authentication, customer service requests, the staff dashboard, owner admin, reviews, contact, moderation, and `pnpm dev` watch/reload are in place. `pnpm start`, `pnpm lint`, and `pnpm test` run. Spreadsheet upload and export, and daily route building are not done.

## Stack

Plain JavaScript as ES modules, Node 24, Express, EJS, PostgreSQL through `pg` and `DATABASE_URL`, native CSS, pnpm, and `node:test`. Supabase and Render are the production host. Mason reported on 2026-11-02 that Supabase is set up, `pnpm migrate` has been run, and the Render service is deployed with `/health` responding through the session pooler ([ADR 0007](docs/adr/0007-persistence-postgres-on-supabase.md), [ADR 0010](docs/adr/0010-deployment-and-trust-boundary.md)). Decisions are in [ARCHITECTURE.md](ARCHITECTURE.md) and [docs/adr/](docs/adr/README.md).

## Architecture summary

One server-rendered Express app using MVC (`models/`, `controllers/`, `views/`, with thin `routes/` and `middleware/`). Customers submit and track service requests. Owners and dispatchers work the queue, match Needs Review requests, and manage links. The owner manages users, roles, and the service catalog. Spreadsheet upload and export, and daily route building are not built.

## Roles

| Role | Can do |
| --- | --- |
| Owner (admin) | Users and roles, the service catalog, owner stats, and the staff actions. Spreadsheet import from a Google Sheet link is built; upload is not |
| Dispatcher | Move requests through statuses, match Needs Review, create and revoke links. Building a daily route is not built |
| Customer | Submit and track requests, leave reviews |

Test account emails (created by `pnpm seed`; the shared password is not listed here): `owner@example.com`, `dispatcher@example.com`, `customer@example.com`.

## Repository layout

- `AGENTS.md`, `CLAUDE.md`: rules for AI agents
- `skills/`: shared skills that `AGENTS.md` refers to
- `ledger/`: AI session logs ([ai-ledger-handoff](skills/ai-ledger-handoff/SKILL.md))
- `docs/`: architecture, setup, QA, security, operations, product and handoff docs ([index](docs/README.md))

## Prerequisites and setup

Node 24, pnpm, and a local PostgreSQL. There is no build step. `pnpm dev` watches `src/` and `public/` and reloads the open page. `pnpm start` is the production command. See [local development](docs/setup/local-development.md).

## Environment variables

Names are in [.env.example](.env.example) and [docs/setup/environment-variables.md](docs/setup/environment-variables.md). Never commit values.

## Database diagram

ERD image: not exported yet. The schema is migrations `001` through `015` ([#29](https://github.com/masontuft/routemaster/issues/29)).

## Deployment

One Render web service with a Supabase database. Mason reported on 2026-11-02 that it is deployed and `/health` responds through the session pooler. See [docs/architecture/deployment.md](docs/architecture/deployment.md).

## Known limitations

See [docs/product/known-limitations.md](docs/product/known-limitations.md).

## Contributing and security

[CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md).
