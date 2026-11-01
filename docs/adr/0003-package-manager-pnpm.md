# ADR 0003: Package Manager

## Status

Accepted

## Date

2026-10-30

## Context

`AGENTS.md` states the standing rule "Use PNPM. Never NPM." The master prompt asks for confirmation before anything is installed.

## Decision drivers

- Mason's standing rule.
- Render must be able to build with it.

## Decision

Use pnpm for all installs and scripts.

## Alternatives considered

- npm. Rejected by the standing rule.

## Consequences

- Mason confirmed that pnpm has deployed successfully on Render in earlier projects. That is his experience, not a statement in Render's documentation: Render's Node version page does not mention pnpm.
- A Render article suggests setting the `packageManager` field and enabling Corepack. pnpm's own CI guide says not to use Corepack. This conflict was seen in search results only. The Render build command is still open ([#38](https://github.com/masontuft/routemaster/issues/38)). `package.json` sets `packageManager` to pnpm 11.24.0. `pnpm start` is `node src/server.js`.
- Verify the first Render build before relying on it.
- Installed dependencies: `express`, `ejs`, `pg`, `express-session`, `connect-pg-simple`, `bcrypt`, `csrf-sync`, and `express-rate-limit`. Installed devDependencies: `eslint`, `@eslint/js`, `@stylistic/eslint-plugin`, and `supertest`.

## References

- Render Node version: https://render.com/docs/node-version
- pnpm in CI: https://pnpm.io/continuous-integration
- Render version-pinning article (seen in search results, not opened): https://render.com/articles/pinning-nodejs-python-ruby-versions
