# Dependency Management

Mason approves each new dependency first. Install with pnpm and commit the lockfile; CI uses a frozen install.

Installed dependencies: `express`, `ejs`, `pg`, `express-session`, `connect-pg-simple`, `bcrypt`, `csrf-sync`, `express-rate-limit`, and `exceljs` 4.4.0 ([ADR 0009](../adr/0009-spreadsheet-import-and-sync.md)).

Installed devDependencies: `eslint`, `@eslint/js`, `@stylistic/eslint-plugin`, and `supertest`.

Not installed: `multer` and Playwright. There is no upload route yet ([#33](https://github.com/masontuft/routemaster/issues/33)).

A dependency audit command is not wired into CI.

TODO (Mason): `pnpm audit` reports two moderate advisories. GHSA-g3hv-75wg-m249 (`minimatch` before 11.0.1) is dev-only through ESLint and, after ExcelJS was added, also production through `archiver` and `unzipper`. ESLint 10 still requires `minimatch` 10. GHSA-w5hq-g745-h8pq (`uuid` before 11.1.1) comes through ExcelJS. ExcelJS calls `uuidv4()` with no buffer, which is the argument that advisory names. Approve an override, or wait until those packages move ([#32](https://github.com/masontuft/routemaster/issues/32)). Do not force an override without that approval; a major bump can break lint or the parser.
