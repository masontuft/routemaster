# Troubleshooting

## `pnpm start` or `pnpm dev` exits because `DATABASE_URL` and `SESSION_SECRET` must be set

**Cause:** Those variables are missing from the process environment. `pnpm start` does not load `.env`. `pnpm dev` loads `.env` only when that file exists.

**Fix:** Copy `.env.example` to `.env` and fill in the values. Use `pnpm dev` locally.

## Node says the engine is unsupported

**Cause:** `package.json` requires Node >= 24, and `.node-version` pins 24. An older Node can still run the current tests, and pnpm prints a warning.

**Fix:** Use Node 24. CI installs that version from `.node-version`.
