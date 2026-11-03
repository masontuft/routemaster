# Routemaster Docs

Routemaster is a server-rendered web app for a service company. Customers submit service requests, owners and dispatchers work the queue, and the owner manages users and the service catalog. The Express server, authentication, staff and owner pages, reviews, contact, migrations 001 through 021, CI with a Postgres 16 service, the spreadsheet import from a Google Sheet link, the day board and the daily route builder are in the repo. Spreadsheet upload and payments are not. Every page here separates what is decided from what exists, and anything unbuilt is marked Not currently implemented.

| Folder | What it holds |
| --- | --- |
| [adr/](adr/README.md) | One file per architecture decision |
| [architecture/](architecture/system-overview.md) | System context, components, data flow, deployment |
| [api/](api/README.md) | Endpoints (there is no separate API) |
| [setup/](setup/local-development.md) | Local setup, environment variables, troubleshooting |
| [qa/](qa/test-strategy.md) | Test strategy, test plan, accessibility, performance |
| [security/](security/security-assessment.md) | Assessment, threat model, secrets, dependencies |
| [operations/](operations/deployment-runbook.md) | Deploy, rollback, incident response |
| [product/](product/known-limitations.md) | Known limitations, [roadmap](product/roadmap.md), backlog labels |
| [process/](process/customer-lifecycle.md) | The customer process from import to route, kept current by a test |
| [handoff/](handoff/project-summary.md) | Summary, reviewer guide, next steps |
| [integrations/](integrations/sprinkler-messenger.md) | Specs for other apps (Sprinkler Messenger) |
| [wireframes/](wireframes/README.md) | No wireframe files. Pages are EJS views in `src/views/` |

The decisions table is in [../ARCHITECTURE.md](../ARCHITECTURE.md). Agent rules are in [../AGENTS.md](../AGENTS.md).
