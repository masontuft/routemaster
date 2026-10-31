# Known Limitations

- The server, pages, and database schema are not implemented yet. The test-database guard and the lint and test tooling exist.
- Customers arrive by link; no screen generates or sends links yet (`pnpm link:create` prints one).
- Generic-link matching is exact after normalization; typos go to a Needs Review queue that has no screen yet.
- Login and link throttling is in-memory and per instance.
- Single company only; multi-tenant is on the [roadmap](roadmap.md).
- Import covers jobs, customers and areas. Expenses, mileage and compressor tabs are not imported.
- Address matching in import is fuzzy; the preview step is mandatory.
- No two-way spreadsheet sync.
- Free Supabase projects may pause after inactivity (unverified).
- Technician logins and the Rocky and Skyview referral payout are undecided.
