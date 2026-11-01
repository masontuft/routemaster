# ADR 0011: Testing and CI

## Status

Accepted

## Date

2026-10-30

## Context

The standing rule in `AGENTS.md` was Jest for unit and integration tests. The project is plain JavaScript as ES modules with no build step. The master prompt asks to confirm that the standing rule still fits the stack.

## Decision drivers

- Native ESM without special flags.
- No new dependencies where the platform already provides one.
- The grading rubric stresses validation, role checks and a stable deployment.

## Decision

- Unit and integration tests: Node's built-in test runner, `node:test`, with `node:assert` and supertest for HTTP tests. Test files are named `*.test.js`. Every major feature has a matching test file, and the agent judges what counts as major.
- Tests run only against a throwaway database selected by `TEST_DATABASE_URL`, never the Supabase project. A guard refuses to run when that variable is missing, is not a Postgres URL, or names the same host, port, and database as `DATABASE_URL`. Cosmetic differences in the connection string do not count as a different database. Locally this is a second database on Mason's local Postgres. In CI it is a Postgres service container.
- End-to-end tests: Playwright, added only after the app starts in a repeatable test mode. First journeys: a customer registers and submits a request; a dispatcher builds a route and moves requests through the statuses; an admin imports a sheet through the preview step.
- CI: GitHub Actions on pull requests and pushes to the default branch. Steps are install with the frozen lockfile, lint, test against the Postgres container, and a build step defined as a boot smoke test that checks the health check URL returns 200.
- Lint: ESLint using the shared config from the `spirit-of-the-law-linting` skill.
- Coverage: no threshold until a baseline has been measured.

## Alternatives considered

- Jest (the standing rule). Its ESM support is labeled experimental and needs `--experimental-vm-modules` and `transform: {}`. `jest` is not a global in ESM, and `jest.mock` is not hoisted, so mocking uses `jest.unstable_mockModule`. Overridden for this project.
- Vitest. Needs Vite 6.4 or newer and Node 22.12 or newer, and brings a build tool into a project without one. Its ESM and mocking pages were not read.

## Consequences

- `AGENTS.md` Testing section changes from Jest to `node:test`.
- `node:test` is stable. Its coverage flag and watch mode are marked experimental. `mock.module` is listed in the API index, but whether it needs a flag was not confirmed. Plan to mock little.
- Server or cloud agents cannot reach Mason's local Postgres. They rely on CI for database tests and record unverified database steps in the ledger for the next local agent. An instructor-hosted database as an optional test target is a roadmap item.
- HTTP tests import supertest as `import request from "supertest"` under `node:test`.
- Playwright's `webServer` option was not read yet.
- The runner, ESLint, the database guard, the HTTP tests, the CI workflow, and the Postgres 16 service container exist. Runs of that workflow on `main` have completed successfully. Playwright and the boot smoke test are not implemented yet.

## References

- Node.js test runner: https://nodejs.org/api/test.html
- Jest ECMAScript modules: https://jestjs.io/docs/ecmascript-modules
- Vitest: https://vitest.dev/guide/
- supertest: https://github.com/ladjs/supertest
- Playwright: https://playwright.dev/docs/intro
- GitHub Actions Postgres service containers: https://docs.github.com/en/actions/using-containerized-services/creating-postgresql-service-containers
