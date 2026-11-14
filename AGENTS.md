# AGENTS.md

This file is the single source of rules for every AI agent working in this repo (Codex, Claude, Cursor, and others). Agent-specific files such as `CLAUDE.md` only point here. Do not put rules anywhere else.

## Project

Routemaster is a web app for service companies that builds daily routes and pairs well with Sprinkler Messenger. See `README.md`. Architecture decisions are in `ARCHITECTURE.md` and `docs/adr/`.

## Skills

The `skills/` folder at the repo root holds the shared skills. Each skill is a folder with one `SKILL.md`. When a rule below names a skill, read `skills/<name>/SKILL.md` before acting on it. Do not copy a skill's rules into this file. Some skills contain `TODO (Mason):` placeholders where source material is missing. Do not invent the missing content.

Two third-party skills from Supabase live in `.agents/skills/`, installed with `npx skills add supabase/agent-skills` and pinned in `skills-lock.json`: `supabase` and `supabase-postgres-best-practices`. Read the matching `SKILL.md` before Supabase or Postgres work. They are not Mason's rules, so this file wins where they differ: migrations stay in `migrations/` and go through a pull request, the Supabase MCP stays read-only (see Shared context), and nothing is run against the live database without Mason's say-so. The `supabase` skill's feedback steps file a public GitHub issue, so ask Mason first. Refresh them with `npx skills update` and review the diff in a pull request.

## Edit workflow

Follow these steps in order, every time:

1. Read the current version of any file before changing it.
2. Create a new branch off the default branch.
3. Commit the changes to that branch.
4. Open a pull request into the default branch.
5. Never commit directly to the default branch.

Before committing, show Mason a short summary of what will change. Mason reviews and merges. The human signs off.

## Package manager

Use PNPM. Never NPM.

## Coding style

Follow the `coding-style-preferences` skill for indentation, naming, language settings (plain JavaScript with ESM in this repo) and backend structure. It is the single place those rules live. The package manager rule stays in Package manager above.

## Communication

- When you show an update, include a code snippet of what changed and explain why it was done that way.
- After the explanation, ask Mason whether he wants to be quizzed on the concepts covered. Do not start the quiz unasked.

## Typography

- Write headings (H1 to H6) in UI copy in Modified Chicago Case. The rules are in the `typography-modified-chicago-case` skill.

## UI style

Floors, the shared palette, and anti-slop rules are in `ui-design-foundations`. When a style skill is loaded it is authoritative for its rules. Foundations floors still apply. This file records the choice and points at the skills. It does not copy their rules.

- Base style: `ui-style-conservative`.
- Page and section overrides: marketing pages (home, services and pricing, about, contact) use `ui-style-futuristic`. The custom 404 and error pages use `ui-style-over-the-top`.
- Palette: `enterprise` (settled, Mason, 2026-11-02): deep blue, white, and bubblegum pink. Brand choice (Mason, 2026-10-31): pink accent is the one loud element, system fonts only, no invented stats or testimonials on marketing pages.
- Mobile platform layer: `ui-design-mobile` applies as phone-browser responsiveness for this website. It combines with the style of the page. It does not replace the base style. There is no native app in this repo.

## Testing

- Use Node's built-in test runner (`node:test`) for unit and integration tests, with supertest for HTTP tests. Test files are named `*.test.js`. Tests run only against the database named by `TEST_DATABASE_URL`, never against `DATABASE_URL`. See `docs/adr/0011-testing-and-ci.md`.
- Keep tests easy to run in a CI/CD pipeline: end-to-end tests for critical user flows, linting, and an automated build on every merge.
- Every major code change must come with a matching test file. The agent judges what counts as major.

## Shared context

Agents share context through the channels below. Use the matching skill for details.

- **Ledger** (`ai-ledger-handoff`): After each segment of work, append an entry to your own file, `ledger/<agent>_YYYY-MM-DD.md`, with Changed, Why, Decisions and Open / next. At the start of a session, or after an agent switch or lost context, read every file in `ledger/` from the last 3 days before working. If there are none, widen the window to 7 days, then 14.
- **Process doc** (`docs/process/customer-lifecycle.md`): The end-to-end customer process, import through route. A change that adds, removes or renames a page in that process, or changes who may do a step or a rule, updates this file in the same pull request and adds a line to its "Changes to the process" table. `src/processDoc.test.js` fails when its paths drift from the routes.
- **Message channel** (`agent-message-bus`): Not used right now. It may become a future feature, so do not set up or post to a `messages` table unless Mason says to.
- **Schema file** (`schema-snapshot`): Read the schema snapshot file before querying the live database. Run the script that generates it to refresh it.

  - Folder: `docs/schemas` (placeholder)
  - Script: `generate schema` (placeholder)

  Both are placeholders. They may differ per project, so confirm them with Mason before relying on them.
- **Supabase MCP** (`.mcp.json`): A read-only connection to the live Supabase project, for docs, logs, advisors and looking at schema and data. Do not remove `read_only=true` from its URL. Schema changes still go through `migrations/` and a pull request, never through the MCP. Mason authenticates it himself with `claude /mcp`.
- **Server and cloud agents:** They cannot reach Mason's local Postgres. Rely on CI for database tests. Record any database step you could not verify in the ledger so the next local agent picks it up.
