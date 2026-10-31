# Changelog

All notable changes are recorded here, following [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added
- Architecture overview, ADRs 0001 to 0011, and the `docs/` tree.
- Contributing guide, security policy and issue and pull request templates.
- `package.json`, ESLint config, `node:test` runner, the `TEST_DATABASE_URL` guard with tests, and a GitHub Actions CI workflow.

### Changed
- Testing rule changed from Jest to `node:test`.

### Fixed

- The system context diagram renders on GitHub. Dotted edge labels that contained periods now use the pipe form.
- The test-database guard treats connection strings that name the same host, port, and database as the same database.
- Setup docs that still said `package.json`, `.node-version`, or CI did not exist.

### Security

- A cosmetic difference in `TEST_DATABASE_URL` (scheme, default port, credentials, trailing slash, or an ignored query parameter) can no longer point tests at the real database.
