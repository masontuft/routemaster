# Known Limitations

- The server, pages, and database schema are not implemented yet. The test-database guard and the lint and test tooling exist.
- Customers arrive by link. Staff create and revoke links on the customer page and copy them by hand; nothing sends them by email or text yet.
- A bulk-send route through Sprinkler Messenger is proposed in [the integration spec](../integrations/sprinkler-messenger.md).
- Generic-link matching is exact after normalization; typos go to the Needs Review queue, where staff match them by hand.
- Matching a Needs Review request cannot edit the name, phone or street the visitor typed; a new customer is created exactly as typed plus the city and ZIP staff enter.
- Status changes have no undo: Completed and Cancelled are final.
- Login and link throttling is in-memory and per instance.
- Single company only; multi-tenant is on the [roadmap](roadmap.md).
- Import covers jobs, customers and areas. Expenses, mileage and compressor tabs are not imported.
- Address matching in import is fuzzy; the preview step is mandatory.
- No two-way spreadsheet sync.
- Free Supabase projects may pause after inactivity (unverified).
- Technician logins and the Rocky and Skyview referral payout are undecided.
