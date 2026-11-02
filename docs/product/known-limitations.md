# Known Limitations

- Spreadsheet import, daily route building (`routes` and `route_stops`), payments, and the About page are not built. The Express server, authentication, service requests, staff dashboard, owner admin, reviews, contact, moderation, migrations 001 through 014, and `pnpm seed` are in the repo. The About page waits on copy from Mason ([#24](https://github.com/masontuft/routemaster/issues/24)).
- Customers arrive by link. Staff create and revoke links on the customer page and copy them by hand; nothing sends them by email or text yet.
- A bulk-send route through Sprinkler Messenger is proposed in [the integration spec](../integrations/sprinkler-messenger.md). The open questions are [issue 37](https://github.com/masontuft/routemaster/issues/37).
- Generic-link matching is exact after normalization; typos go to the Needs Review queue, where staff match them by hand.
- Matching a Needs Review request cannot edit the name, phone or street the visitor typed; a new customer is created exactly as typed plus the city and ZIP staff enter.
- Status changes have no undo: Completed and Cancelled are final.
- Login, magic-link redemption, the generic `/schedule` posts, and the contact form are rate limited in memory, per instance. The counts reset on restart.
- Single company only; multi-tenant is on the [roadmap](roadmap.md).
- Spreadsheet import is not built ([#33](https://github.com/masontuft/routemaster/issues/33)). The decided scope is jobs, customers and areas. Expenses, mileage and compressor tabs are outside that scope.
- When import is built, address matching is fuzzy and the preview step is mandatory ([ADR 0009](../adr/0009-spreadsheet-import-and-sync.md)).
- No two-way spreadsheet sync.
- Free Supabase projects may pause after inactivity (unverified).
- Technician logins ([#34](https://github.com/masontuft/routemaster/issues/34)) and the Rocky and Skyview referral payout ([#35](https://github.com/masontuft/routemaster/issues/35)) are undecided.
- The seeded service types start at 0 cents. Until real prices are entered, the public services page says "Contact us for pricing." and owner money stats for those catalog prices read $0.00 ([#23](https://github.com/masontuft/routemaster/issues/23)).
- Replying to a contact message records a note and sets the status; nothing is emailed.
- Reviews, contact messages, and the generic link have no spam filter beyond the per-IP rate limit and CSRF token ([#36](https://github.com/masontuft/routemaster/issues/36)).
- A review can only be written for a Completed request, so customers who never use the site cannot review.
