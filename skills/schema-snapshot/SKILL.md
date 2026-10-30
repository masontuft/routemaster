---
name: schema-snapshot
description: Use when agents need to know the database structure without querying the live database each time.
---

# Schema snapshot

Avoid spending tokens on schema discovery. A Node script dumps the live database schema to a file any AI can read.

1. Add a Node/JavaScript script that copies the live schema to a file in the repo. Put the file in `docs/schemas` and name the script `generate schema`.
2. Any AI runs the script and reads the file, then matches the existing structure.
3. Use the snapshot for periodic audits. Example: ask a second model whether the table count and design are sensible.

The folder (`docs/schemas`) and the script name (`generate schema`) are placeholders. They may differ per project, so confirm the real values with Mason before relying on them. Mason still decides when a snapshot is trusted for an audit.

> "Just make a file that pulls down the schema. So if any AI runs this, a JavaScript kicks off, Node, copies the live schema to a file, and I didn't waste a single token."
