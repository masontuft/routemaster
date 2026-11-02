# Data Flow

## Service request (built)

1. A customer submits a form, as a signed-in customer, through a magic link, or on the generic `/schedule` page. Input is validated server-side.
2. A model inserts a `service_requests` row with a parameterized query and writes a `status_history` row.
3. An owner or dispatcher moves the request through the statuses in `src/utils/transitions.js`. Scheduling requires a date. Each change adds a `status_history` row. Assigning the request to a route (`route_stops`) is not built.
4. The customer sees the updated status on a server-rendered page.

## Spreadsheet import (not built)

1. The owner pastes a Google Sheet link or uploads an `.xlsx` file.
2. The app reads the tab list. The owner picks tabs and maps columns, then reviews a preview of rows to add, update or flag.
3. On confirm, rows are written inside a transaction and the run is recorded in `import_batches`.

Matching uses a normalized address because the sheet has no row IDs. See [ADR 0009](../adr/0009-spreadsheet-import-and-sync.md). The fetch route for a public sheet is unverified ([#33](https://github.com/masontuft/routemaster/issues/33)).
