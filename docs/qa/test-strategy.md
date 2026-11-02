# Test Strategy

Decided in [ADR 0011](../adr/0011-testing-and-ci.md). The runner and the feature test files under `src/` exist. The areas they cover are listed in the [test plan](test-plan.md).

- Runner: `node:test` with `node:assert`; supertest for HTTP. Files are named `*.test.js`.
- Rule: any time we add a major feature, there needs to be a test file associated.
- Database: tests run only against `TEST_DATABASE_URL`. The guard refuses to run when that URL is missing, is not a Postgres URL, or names the same host, port, and database as `DATABASE_URL`.
- End-to-end: Playwright later, once the app starts in a repeatable test mode.
- CI: `.github/workflows/ci.yml` runs a frozen install, lint, and test on pull requests and pushes to `main`. A Postgres 16 service container supplies `TEST_DATABASE_URL`. Runs of that workflow on `main` have completed successfully. The boot smoke test (health check returns 200) is still to come.
- Coverage: no threshold until a baseline is measured.
- HTTP tests import supertest as `import request from "supertest"` and run under `node:test`.
- Unverified: `mock.module` in `node:test`, Playwright `webServer`.
