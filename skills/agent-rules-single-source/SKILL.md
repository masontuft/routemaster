---
name: agent-rules-single-source
description: Use when setting up a new repo for more than one AI coding agent (Codex, Claude, Cursor) so they all follow the same rules.
---

# One source of truth for agent rules

Put shared rules in one place and point every agent at that file. Copy the files in from this skills repo at the start of each project. When a new AI habit is annoying, add a rule there.

1. Put every shared rule in a root `AGENTS.md`. Codex reads that file as its agents file.
2. Make each agent-specific file (for example Claude's) a short pointer that says to go read `AGENTS.md`. Do not spread rules across mixed files.
3. Start that `AGENTS.md` from the template below. It has sections for package manager, coding style, communication, typography, UI style, testing, shared context, and a generic edit workflow (branch, pull request, human signs off). Leave out this skills library's own rules: the copying note, repo layout, access rules, skill style, README format, and the note that markdown headings in this repo stay sentence case.
4. To start Codex, open a terminal in the project directory and run `codex`. It takes that directory as context.

The package-manager section in the template says: "Use PNPM. Never NPM."

> "So I just have the agent-specific file that says, hey, go read this one instead."
>
> "So I only have to update one place that any AI I use uses the same rules."

Project template. Copy this into the project's root `AGENTS.md`. It is the generic form of this repo's rules, not a second copy of the skills-library file.

```markdown
# AGENTS.md

This file is the single source of rules for every AI agent working in this repo (Codex, Claude, Cursor, and others). Agent-specific files such as `CLAUDE.md` only point here. Do not put rules anywhere else.

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

Follow the `coding-style-preferences` skill for indentation, naming, TypeScript settings and backend structure. It is the single place those rules live. The package manager rule stays in Package manager above.

## Communication

- When you show an update, include a code snippet of what changed and explain why it was done that way.
- After the explanation, ask Mason whether he wants to be quizzed on the concepts covered. Do not start the quiz unasked.

## Typography

- Write headings (H1 to H6) in UI copy in Modified Chicago Case. The rules are in the `typography-modified-chicago-case` skill.

## UI style

Floors, the shared palette, and anti-slop rules are in `ui-design-foundations`. When a style skill is loaded it is authoritative for its rules. Foundations floors still apply. This file records the choice and points at the skills. It does not copy their rules.

- Base style: (fill after Mason answers: `ui-style-conservative`, `ui-style-futuristic`, or `ui-style-over-the-top`)
- Page and section overrides: (none, or a short map such as settings = conservative, landing = futuristic, recap = over the top)
- Palette: (fill after Mason answers: `health`, `premium`, or `enterprise`)
- Mobile platform layer: (`ui-design-mobile` applies, or it does not). It combines with the style of the page. It does not replace the base style.

## Testing

- Use Jest for unit and integration tests.
- Keep tests easy to run in a CI/CD pipeline: end-to-end tests for critical user flows, linting, and an automated build on every merge.
- Every major code change must come with a matching test file. The agent judges what counts as major.

## Shared context

Agents share context through the channels below. Use the matching skill for details.

- **Ledger** (`ai-ledger-handoff`): After each segment of work, append an entry to your own file, `ledger/<agent>_YYYY-MM-DD.md`, with Changed, Why, Decisions and Open / next. At the start of a session, or after an agent switch or lost context, read every file in `ledger/` from the last 3 days before working. If there are none, widen the window to 7 days, then 14.
- **Message channel** (`agent-message-bus`): Not used right now. It may become a future feature, so do not set up or post to a `messages` table unless Mason says to.
- **Schema file** (`schema-snapshot`): Read the schema snapshot file before querying the live database. Run the script that generates it to refresh it.

  - Folder: `docs/schemas` (placeholder)
  - Script: `generate schema` (placeholder)

  Both are placeholders. They may differ per project, so confirm them with Mason before relying on them.
```
