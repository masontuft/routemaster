# Data Flow

Proposed, Not currently implemented.

## Service request

1. A customer submits a form. Input is validated and sanitized server-side.
2. A model inserts a `service_requests` row with a parameterized query and writes a `status_history` row.
3. A dispatcher moves the request through statuses and assigns it to a route (`route_stops`). Each change adds a `status_history` row.
4. The customer sees the updated status on a server-rendered page.

## Spreadsheet import

1. The owner pastes a Google Sheet link or uploads an `.xlsx` file.
2. The app reads the tab list. The owner picks tabs and maps columns, then reviews a preview of rows to add, update or flag.
3. On confirm, rows are written inside a transaction and the run is recorded in `import_batches`.

Matching uses a normalized address because the sheet has no row IDs. See [ADR 0009](../adr/0009-spreadsheet-import-and-sync.md). The fetch route for a public sheet is unverified.
