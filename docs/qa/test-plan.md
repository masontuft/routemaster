# Test Plan

Covered by `*.test.js` files: the test-database guard, authentication (register, login, logout, wrong password, CSRF, session fixation, session stored in Postgres), authorization (visitor, customer, dispatcher, and owner against the staff, admin, request, review, and message routes, including denied cases), validation on the forms those tests post, the request workflow and `status_history`, reviews, contact, migrations, money parsing, and the error page for a thrown error (`src/app.test.js`).

Not covered yet:

- Session cookie flags (`httpOnly`, `Secure`, `SameSite`) are set in `src/middleware/session.js` and have no assertion in the tests.
- Daily routes: assigning and ordering stops. Those tables are not built.
- Import: tab picker, mapping, preview, confirm, bad link, wrong file type, oversized file. Import is not built ([#33](https://github.com/masontuft/routemaster/issues/33)).
- Playwright journeys from [ADR 0011](../adr/0011-testing-and-ci.md).
