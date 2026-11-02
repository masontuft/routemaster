# Dependency Management

Mason approves each new dependency first. Install with pnpm and commit the lockfile; CI uses a frozen install.

Installed dependencies: `express`, `ejs`, `pg`, `express-session`, `connect-pg-simple`, `bcrypt`, `csrf-sync`, and `express-rate-limit`.

Installed devDependencies: `eslint`, `@eslint/js`, `@stylistic/eslint-plugin`, and `supertest`.

Not installed: `multer`, an `.xlsx` parser, and Playwright. The parser is undecided ([#33](https://github.com/masontuft/routemaster/issues/33)).

A dependency audit command is not wired into CI.

`pnpm-workspace.yaml` overrides `minimatch` to `^11.0.1`. That is the 11.x line that includes the fix for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (`minimatch` before 11.0.1, moderate, dev-only through ESLint 10, which still depends on `minimatch` 10). pnpm 11 reads overrides from that file. Remove the override once ESLint depends on a patched `minimatch`.
