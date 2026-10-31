# ADR 0009: Spreadsheet Import and Sync

## Status

Proposed. Open items: the fetch route for a public Google Sheet is unverified and needs a spike, and the Excel parsing library is not chosen.

## Date

2026-10-30

## Context

Mason's current business data lives in a public Google Sheet of sprinkler blowout jobs. It has 17 tabs. The tabs share no layout, no row has a unique ID, dates have no year, amounts mix formats, and the status sits in an unlabeled column. It contains customers' names, phones and addresses.

## Decision drivers

- An admin should be able to populate the database from the sheet or from an Excel file.
- Postgres must become the source of truth after import.
- Stay inside the course scope.

## Decision

A staged plan:

1. Import (v1). The admin pastes a Google Sheet link or uploads an `.xlsx` file, picks which tabs to import, maps columns on a per-tab mapping screen, reviews a preview of what will be added, updated or flagged, and confirms. Scope is jobs, customers and areas. The admin enters a season year for each import. Column mappings are saved per tab in `import_mappings`, and each run is recorded in `import_batches`. Rows match existing records by a normalized address, which is fuzzy, so the preview step is mandatory.
2. Export. An admin button downloads the database as `.xlsx`.
3. Stretch goal. A two-way admin sync button. A public sheet is read-only without Google authorization, so this stage needs OAuth or a service account. Not part of the graded scope.

Security rules: link imports accept only Google Sheets URLs, extract the sheet ID with a strict pattern and fetch a fixed path on `docs.google.com`. Uploads use multer on the import route only, with a size limit and an `.xlsx` filter.

## Alternatives considered

- Live two-way sync with Drive push notifications. Notifications need a public HTTPS endpoint, have empty bodies, last at most one day for files and have no automatic renewal. Rejected for scope.
- Apps Script `onEdit` triggers and Supabase database webhooks (from an earlier design discussion). Not researched here. Rejected for scope, and the webhooks tie the design to one host.
- Importing every tab as it is. Rejected: layouts differ too much.

## Consequences

- The export URL pattern `export?format=xlsx` is documented only by community posts, with one comment asking whether it stopped working in 2022. The Sheets API with an API key for public sheets is not verified either. A spike must prove one route against the real sheet before this ADR can be Accepted. The fetch sits behind one function so the route can change, and uploading a downloaded `.xlsx` is the fallback.
- ExcelJS appeared as a candidate, but its ESM support and release status were not confirmed. No library is chosen.
- Real customer data must never be committed. Test data is fake.
- Multi-tenant import, expenses, mileage and compressor tabs are on the roadmap, not in scope.
- Nothing is built yet: Not currently implemented.

## References

- Sheets API concepts: https://developers.google.com/workspace/sheets/api/guides/concepts
- Drive push notifications: https://developers.google.com/workspace/drive/api/guides/push
- multer: https://github.com/expressjs/multer
- ExcelJS: https://github.com/exceljs/exceljs
