# Test Plan

Covered by `*.test.js` files: the test-database guard, authentication (register, login, logout, wrong password, CSRF, session fixation, session stored in Postgres), authorization (visitor, customer, dispatcher, and owner against the staff, admin, request, review, and message routes, including denied cases), validation on the forms those tests post, the request workflow and `status_history`, reviews, contact, migrations, money parsing, the spreadsheet fetch and `.xlsx` parse modules (`src/import/`), and the error page for a thrown error (`src/app.test.js`).

Not covered yet:

- Session cookie flags (`httpOnly`, `Secure`, `SameSite`) are set in `src/middleware/session.js` and have no assertion in the tests.
- Daily routes: assigning and ordering stops. Those tables are not built.
- Import: tab list, mapping, preview and confirm are tested in `src/import.test.js` (roles, CSRF, tampered fields, outcomes, nothing written by the preview, escaping, no-store, stale and repeated confirm, refresh-safe result page, saved mapping) and in `src/import/*.test.js` (mapping, dates, amounts, matching, the plan and its hash, and the transactional write: fields, rerun, rollback, concurrency, scale, owner stats). Upload is not builtConfirm is not built ([#33](https://github.com/masontuft/routemaster/issues/33)). `src/import/` tests the download with a mocked network, and parses a fake `.xlsx` fixture, including the size and row limits.
- Playwright journeys from [ADR 0011](../adr/0011-testing-and-ci.md).
