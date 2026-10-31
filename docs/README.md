# Routemaster Docs

Routemaster is a server-rendered web app for a service company. Customers submit service requests, dispatchers build daily routes, and the owner manages everything. The server is not built yet. Tooling and the test-database guard exist. Every page here separates what is decided from what exists, and anything unbuilt is marked Not currently implemented.

| Folder | What it holds |
| --- | --- |
| [adr/](adr/README.md) | One file per architecture decision |
| [architecture/](architecture/system-overview.md) | System context, components, data flow, deployment |
| [api/](api/README.md) | Endpoints (there is no separate API) |
| [setup/](setup/local-development.md) | Local setup, environment variables, troubleshooting |
| [qa/](qa/test-strategy.md) | Test strategy, test plan, accessibility, performance |
| [security/](security/security-assessment.md) | Assessment, threat model, secrets, dependencies |
| [operations/](operations/deployment-runbook.md) | Deploy, rollback, incident response |
| [product/](product/known-limitations.md) | Known limitations, roadmap, backlog labels |
| [handoff/](handoff/project-summary.md) | Summary, reviewer guide, next steps |
| [integrations/](integrations/sprinkler-messenger.md) | Specs for other apps (Sprinkler Messenger) |
| [wireframes/](wireframes/README.md) | Screens (none yet) |

The decisions table is in [../ARCHITECTURE.md](../ARCHITECTURE.md). Agent rules are in [../AGENTS.md](../AGENTS.md).
