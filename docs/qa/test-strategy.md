# Test Strategy

Decided in [ADR 0011](../adr/0011-testing-and-ci.md). The runner and one test file (the `TEST_DATABASE_URL` guard) exist and pass locally. No feature tests exist yet.

- Runner: `node:test` with `node:assert`; supertest for HTTP. Files are named `*.test.js`.
- Rule: any time we add a major feature, there needs to be a test file associated.
- Database: tests run only against `TEST_DATABASE_URL`. The guard refuses to run when that URL is missing, is not a Postgres URL, or names the same host, port, and database as `DATABASE_URL`.
- End-to-end: Playwright later, once the app starts in a repeatable test mode.
- CI: `.github/workflows/ci.yml` runs a frozen install, lint, and test on pull requests and pushes to `main`. A Postgres 16 service container supplies `TEST_DATABASE_URL`; it has not run on GitHub yet. The boot smoke test is still to come.
- Coverage: no threshold until a baseline is measured.
- Verified locally: supertest imports under ESM (`import request from "supertest"`) and works with `node:test`.
- Unverified: `mock.module` in `node:test`, Playwright `webServer`.
