# Dependency Management

Mason approves each new dependency first. Install with pnpm and commit the lockfile; CI uses a frozen install.

Installed dependencies: `express`, `ejs`, `pg`, `express-session`, `connect-pg-simple`, `bcrypt`, `csrf-sync`, and `express-rate-limit`.

Installed devDependencies: `eslint`, `@eslint/js`, `@stylistic/eslint-plugin`, and `supertest`.

Not installed: `multer`, an `.xlsx` parser, and Playwright. The parser is undecided ([#33](https://github.com/masontuft/routemaster/issues/33)).

A dependency audit command is not wired into CI.

TODO (Mason): `pnpm audit` reports GHSA-g3hv-75wg-m249 (`minimatch` before 11.0.1, moderate, dev-only through ESLint). ESLint 10 still requires `minimatch` 10. Approve an override to `minimatch` 11, or wait until ESLint depends on a patched release ([#32](https://github.com/masontuft/routemaster/issues/32)). Do not force the override without that approval; a major bump can break lint.
