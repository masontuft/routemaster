---
name: erd-sync
description: Use when a change adds, drops or alters a database table, column or foreign key, so every copy of the entity relationship diagram stays in step with the migrations.
---

# ERD sync

A database change is not finished until every copy of the ERD matches it. The migrations are the source of truth; each diagram is a copy. Some copies are checked by a test and some are not, and the unchecked ones go stale quietly. Mason still decides when a board is trusted as current.

1. **Start from the migrations.** Never edit a diagram first. Fetch the remote and compare against the main branch, not your local checkout, which may be behind. A table can already be on main that your checkout has never seen.
2. **Regenerate the diagram in the repo** with the project's ERD script, then run the test that fails when the diagram drifts from the migrations. Commit the regenerated diagram in the same pull request as the migration.
3. **Update the schema reference** (every table and column, with type and nullability) in the same pull request. The same test usually checks it.
4. **Update every hand-made copy**, such as a FigJam or Figma board. Nothing tests these, so they are the ones that go stale.
   - Work out the change from the diagram text (`git diff` on the diagram block): tables added or dropped, key columns added or dropped, relationships added or dropped.
   - Apply only that change. Do not rebuild the board. Clone an existing table so the new one inherits its styling.
   - Map the diagram's line ends to the board's: `||` exactly one, `|o` and `o|` zero or one, `o{` zero or more. The parent is the start of a connector and the child is the end. Label each connector with its foreign key column.
   - Read the board back and compare every table row and every connector with the diagram text. Counts are not enough; compare the rows and the line ends. Also check that no tables overlap, because added rows make a table taller.
   - Update the "made on" date next to the board's link.
5. **Say what you could not do.** If the session cannot reach the board, do not call the sync done. Write it under "Open / next" in the ledger and in the pull request description, so the next agent or Mason finishes it.
6. **Log it.** Add a ledger entry that names each copy you updated.

Example: on 2026-11-19 the FigJam board was 3 tables and about 14 relationships behind the migrations. It was missing `leads` (migration 025) and `companies` (migration 028). The diff showed three new tables, a `company_id` row on 10 tables, and 14 new connectors. Only those were added, and a script then compared every row and connector with the diagram text: 23 tables and 46 connectors, nothing missing or extra.

The script name, the diagram and reference paths, the test file and the board link differ per project, so confirm them with Mason before relying on them. Put the real values in the project's `AGENTS.md`.

> "if it is not up to date, write in our skills to update that as we make database changes"
