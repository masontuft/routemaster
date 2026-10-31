# Test Strategy

Decided in [ADR 0011](../adr/0011-testing-and-ci.md). Nothing is built, and no test has been run.

- Runner: `node:test` with `node:assert`; supertest for HTTP. Files are named `*.test.js`.
- Rule: any time we add a major feature, there needs to be a test file associated.
- Database: tests run only against `TEST_DATABASE_URL`, with a guard that refuses to run if it is missing or equals `DATABASE_URL`.
- End-to-end: Playwright later, once the app starts in a repeatable test mode.
- CI: GitHub Actions with a Postgres service container: frozen install, lint, test, boot smoke test. Not yet written.
- Coverage: no threshold until a baseline is measured.
- Unverified: supertest with ESM imports, `mock.module` in `node:test`, Playwright `webServer`.
