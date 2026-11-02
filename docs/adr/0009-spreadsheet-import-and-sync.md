# ADR 0009: Spreadsheet Import and Sync

## Status

Accepted. Mason approved the fetch spike and chose ExcelJS on 2026-11-02. The findings are in the update below. The import screens, the upload route, and the database writes are not built.

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

The bullets below are the 2026-10-30 proposal. The update is the spike result, and it is why this ADR is Accepted.

- The export URL pattern `export?format=xlsx` is documented only by community posts, with one comment asking whether it stopped working in 2022. The Sheets API with an API key for public sheets is not verified either. A spike must prove one route against the real sheet before this ADR can be Accepted. The fetch sits behind one function so the route can change, and uploading a downloaded `.xlsx` is the fallback.
- ExcelJS appeared as a candidate, but its ESM support and release status were not confirmed. No library is chosen.
- Real customer data must never be committed. Test data is fake.
- Multi-tenant import, expenses, mileage and compressor tabs are on the roadmap, not in scope.
- Fetch and parse live in `src/import/` and are covered by tests. The owner-only `POST /admin/import` page lists a pasted sheet's tabs with counts. The mapping and preview screens, the upload route, and the database writes are not built ([#33](https://github.com/masontuft/routemaster/issues/33)).

## Update 2026-11-02

Mason approved the spike and named ExcelJS. No other parser was installed. `multer` is not installed, because there is no upload route. The parser takes a buffer so a later route can pass one.

Fetch, in `src/import/googleSheet.js`:

- A pasted link is accepted only as `https://docs.google.com/spreadsheets/` with an optional `/u/0/` segment, then `/d/{id}`, then an optional view name (`edit`, `view`, `htmlview`, `preview`, `export`, `copy`, `pubhtml`). The id is 33 to 64 characters from `[A-Za-z0-9_-]`. `http`, any other host, userinfo, a non-default port, and any other path are rejected.
- The request URL is always `https://docs.google.com/spreadsheets/d/{id}/export?format=xlsx`. The pasted query string is not copied, so the caller cannot choose the host.
- On 2026-11-02 that URL still works for a public sheet, and the file is not in the first response. `docs.google.com` answers 307. There is still no official Sheets API page for this URL. The module follows at most two redirects with `redirect: "manual"`. A hop must be `https`, with no userinfo, no port, and `format=xlsx`. The host must be `docs.google.com` with the fixed export path for that id, or a single-label `*.googleusercontent.com` host whose path starts with `/export/` and includes the sheet id as a path segment. `accounts.google.com` means the sheet is not public, and it is not fetched. Any other host is refused, and the refused URL is not put in the error message. A repeated URL is refused.
- Cookies are not stored and are not sent (`credentials: "omit"`).
- The body is capped at 5 MiB. A `Content-Length` over that cap is rejected before the body is read. The stream is counted as well: the 307 advertised `Content-Length: 0`, and the file response was chunked.
- The timeout is 15 seconds.
- The live check used Google's public example spreadsheet (the Sheets API sample, id `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`, file name Example Spreadsheet). Called through this module, the download was 5654 bytes and started with the ZIP signature. ExcelJS then read one sheet, "Class Data", with 31 rows and 6 columns. Mason's customer sheet was not fetched. Its URL is not in the repo.
- Unit tests mock `fetch`. The live check is not part of CI.

Parse, in `src/import/xlsxRows.js`:

- ExcelJS 4.4.0. The npm registry lists it as the latest stable release, published 2023-10-19. `4.4.1-prerelease.0` (2024-12-20) was not installed. `package.json` pins `4.4.0`.
- The package is CommonJS (`main` is `excel.js`, and that file sets `module.exports`). The README Importing section shows `require("exceljs")` only. There is no `exports` map. `import ExcelJS from "exceljs"` works on Node 24.22.2 because Node uses `module.exports` as the default export. The parser tests load the package that way.
- `workbook.xlsx.load` reads the buffer. Values that leave the module are strings, finite numbers, booleans, ISO date strings, or null. Formula, rich-text, and hyperlink objects are reduced to those.
- The same caps as the fetch: 5 MiB, 40 sheets, 20,000 rows, and 64 columns. A 17-tab job sheet fits under the sheet cap. The checked-in fixture is `src/import/fixtures/tiny.xlsx` (fake rows only). `.gitignore` still ignores `*.xlsx` except that file.
- ExcelJS expands the zip in memory before the row cap runs. A small compressed file can still expand. `src/import/zipLimits.js` reads the zip's central directory first and refuses more than 200 entries or 50 MiB declared uncompressed. Those sizes are the archive's own claim and a hostile file can lie, so a streaming read or a worker with a memory cap should land with the upload route.

`pnpm audit` reports two moderate advisories. No new override was added. Mason approves dependency changes.

- [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) (`uuid` before 11.1.1). It comes through `exceljs@4.4.0`. The advisory title is a missing buffer bounds check in v3, v5, and v6 when `buf` is provided. ExcelJS calls `uuidv4()` with no buffer, in `lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`, so this parse path does not pass that argument.
- [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (`minimatch` before 11.0.1). The ESLint path is covered by the `^11.0.1` override from [#32](https://github.com/masontuft/routemaster/issues/32). ExcelJS adds a production path that the override does not reach in the lockfile (`minimatch` 3.1.5 and 5.1.9) through `archiver` and `unzipper`.

## References

- Sheets API concepts: https://developers.google.com/workspace/sheets/api/guides/concepts
- Drive push notifications: https://developers.google.com/workspace/drive/api/guides/push
- multer: https://github.com/expressjs/multer
- ExcelJS: https://github.com/exceljs/exceljs (Importing section shows `require` only; checked in the installed 4.4.0 README)
- ExcelJS 4.4.0 on the npm registry, including the 2023-10-19 publish time and the later prerelease that was not installed
- uuid advisory: https://github.com/advisories/GHSA-w5hq-g745-h8pq
- minimatch advisory: https://github.com/advisories/GHSA-g3hv-75wg-m249
