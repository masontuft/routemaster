# Dependency Management

Mason approves each new dependency first. Install with pnpm and commit the lockfile; CI uses a frozen install.

Installed devDependencies: `eslint`, `@eslint/js`, and `@stylistic/eslint-plugin`.

Not installed yet: express, ejs, pg, express-session, connect-pg-simple, bcrypt, multer, an `.xlsx` parser, supertest, playwright.

A dependency audit command is not wired into CI.

TODO (Mason): `pnpm audit` reports GHSA-g3hv-75wg-m249 (`minimatch` before 11.0.1, moderate, dev-only through ESLint). ESLint 10 still requires `minimatch` 10. Approve an override to `minimatch` 11, or wait until ESLint depends on a patched release. Do not force the override without that approval; a major bump can break lint.
