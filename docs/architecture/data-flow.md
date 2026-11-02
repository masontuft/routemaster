# Data Flow

## Service request (built)

1. A customer submits a form, as a signed-in customer, through a magic link, or on the generic `/schedule` page. Input is validated server-side.
2. A model inserts a `service_requests` row with a parameterized query and writes a `status_history` row.
3. An owner or dispatcher moves the request through the statuses in `src/utils/transitions.js`. Scheduling requires a date. Each change adds a `status_history` row. Assigning the request to a route (`route_stops`) is not built.
4. The customer sees the updated status on a server-rendered page.

## Spreadsheet import

1. The owner pastes a public Google Sheet link. The app downloads it and lists the tabs.
2. The owner picks a tab, maps columns, and sets the season year, a service type, a status, and a default city. The preview shows what confirming would create, what is skipped, and how many new properties have no city (they are saved with the street alone). It writes nothing.
3. On confirm the app downloads the sheet again and, inside one transaction under an advisory lock, recomputes the plan and compares its hash with the preview's. If they match, it writes areas, customers, properties, dated jobs and status history in set-based chunks, records the run in `import_batches`, and saves the mapping in `import_mappings`. If they differ, nothing is written and the owner sees a fresh preview.

Each step carries only the sheet id, so the link is rebuilt and re-validated every time. Matching uses the normalized street (plus name and phone) because the sheet has no row IDs, so the preview is mandatory. A job already on file for the same property, service and day is not added again, so confirming the same sheet twice changes nothing. Imported jobs are dated by their own day, so the owner's monthly numbers are not swamped. See [ADR 0009](../adr/0009-spreadsheet-import-and-sync.md). Upload and export are not built ([#33](https://github.com/masontuft/routemaster/issues/33)).
