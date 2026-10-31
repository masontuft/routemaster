# Routemaster

Web app for service companies that builds daily routes and pairs well with Sprinkler Messenger. It is Mason's CSE 340 final project (Option A, design your own).

**Status:** planning. Architecture, docs, and the test-database guard are in place. The server is not written yet, so `pnpm start` fails. `pnpm lint` and `pnpm test` run.

## Stack

Plain JavaScript as ES modules, Node 24, Express, EJS, PostgreSQL on Supabase, native CSS, pnpm, `node:test`, deployed to Render. Decisions are in [ARCHITECTURE.md](ARCHITECTURE.md) and [docs/adr/](docs/adr/README.md).

## Architecture summary

One server-rendered Express app using MVC (`models/`, `controllers/`, `views/`, with thin `routes/` and `middleware/`). Customers submit service requests, dispatchers build daily routes, and the owner manages everything and imports data from a Google Sheet or `.xlsx` file.

## Roles

| Role | Can do |
| --- | --- |
| Owner (admin) | Everything, including spreadsheet import and user management |
| Dispatcher | Move requests through statuses and build routes |
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

ERD image: to be added from pgAdmin once the schema exists.

## Deployment

Planned: one Render web service with a Supabase database. Unverified. See [docs/architecture/deployment.md](docs/architecture/deployment.md).

## Known limitations

See [docs/product/known-limitations.md](docs/product/known-limitations.md).

## Contributing and security

[CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md).
