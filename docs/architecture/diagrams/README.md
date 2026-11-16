# Diagrams

Diagrams live as Mermaid blocks in sibling docs, so they stay in git and GitHub renders them:

- [System context and components](../system-overview.md)
- Data flow is described in text in [data-flow.md](../data-flow.md).
- The database ERD is a Mermaid block made from the migrations: [database-erd.md](../database-erd.md). Run `pnpm erd` after a migration; a test fails if it is out of date.

The ERD image the course requires is not exported ([#29](https://github.com/masontuft/routemaster/issues/29)). GitHub renders the Mermaid diagram, and a FigJam copy is linked from that page.
