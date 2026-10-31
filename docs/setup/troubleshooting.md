# Troubleshooting

## `pnpm start` cannot find `src/server.js`

**Cause:** The start script is `node src/server.js`, and that file is not written yet.

**Fix:** None until the server exists. `pnpm lint` and `pnpm test` do not need it.

## Node says the engine is unsupported

**Cause:** `package.json` requires Node >= 24, and `.node-version` pins 24. An older Node can still run the current tests, and pnpm prints a warning.

**Fix:** Use Node 24. CI installs that version from `.node-version`.
