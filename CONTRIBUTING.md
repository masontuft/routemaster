# Contributing

Agent rules live in [AGENTS.md](AGENTS.md). Humans follow the same workflow.

## Branches

Never commit to `main`. Name branches `type/short-description`, for example `feat/personal-plans-page`, `fix/nav-overflow`, `design/article-contrast-fixes`, `refactor/extract-route-matcher`. This repo also uses `docs/` and `chore/`.

## Commits

Write a short imperative summary line, such as "Add login route". Add a body only when the reason is not obvious. Make each commit one coherent change.

## Local setup

Not available yet: there is no `package.json`. See [local development](docs/setup/local-development.md). Use pnpm, never npm.

## Pull request checklist

- Tests added or updated. Any major feature has a `*.test.js` file.
- Lint passes (an ESLint config arrives with the CI phase).
- A bug fix includes a regression test where practical.
- Behavior changes update the docs and tests.
- No secrets, `.env` files, build output or coverage output.
- A ledger entry is added for agent work.

## Style

Follow the [coding-style-preferences skill](skills/coding-style-preferences/SKILL.md). The project uses plain JavaScript as ES modules.

## Real data

Never commit the real customer spreadsheet or exports of it. Use fake data in tests.
