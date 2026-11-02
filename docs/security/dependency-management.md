# Dependency Management

Mason approves each new dependency first. Install with pnpm and commit the lockfile; CI uses a frozen install.

Installed dependencies: `express`, `ejs`, `pg`, `express-session`, `connect-pg-simple`, `bcrypt`, `csrf-sync`, `express-rate-limit`, and `exceljs` 4.4.0 ([ADR 0009](../adr/0009-spreadsheet-import-and-sync.md)).

Installed devDependencies: `eslint`, `@eslint/js`, `@stylistic/eslint-plugin`, and `supertest`.

Not installed: `multer` and Playwright. There is no upload route yet ([#33](https://github.com/masontuft/routemaster/issues/33)).

A dependency audit command is not wired into CI.

`pnpm-workspace.yaml` overrides `minimatch` to `^11.0.1`. That is the 11.x line that includes the fix for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (`minimatch` before 11.0.1, moderate, dev-only through ESLint 10, which still depends on `minimatch` 10). pnpm 11 reads overrides from that file. Remove the override once ESLint depends on a patched `minimatch`.

TODO (Mason): `pnpm audit` reports two moderate advisories after ExcelJS was added. GHSA-g3hv-75wg-m249 (`minimatch` before 11.0.1) still appears on the ExcelJS production path through `archiver`, `unzipper`, and `readdir-glob`. The `^11.0.1` override above is recorded in the lockfile, but `pnpm install --fix-lockfile` leaves those paths on `minimatch` 3.1.5 and 5.1.9, and their callers are older majors that a forced 11.x could break. GHSA-w5hq-g745-h8pq (`uuid` before 11.1.1) comes through ExcelJS. ExcelJS calls `uuidv4()` with no buffer, which is the argument that advisory names. Approve a fix, or wait until ExcelJS moves ([#32](https://github.com/masontuft/routemaster/issues/32)). Do not force an override without that approval.
