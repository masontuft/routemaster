# ADR 0017: Leads for Unmatched Visitors

## Status

Proposed. Mason approved the plan on 2026-11-17. It stays Proposed until the migrations have run on the live database and the backfilled leads have been looked at, and until Mason has looked at the delete pages in a browser. It changes one detail of [ADR 0012](0012-customer-access-by-link.md), where a visitor with no match "stores the typed details and no customer" on the request. The rest of ADR 0012 stands.

## Date

2026-11-17

## Context

The public `/schedule` page matches a visitor to a customer by name, phone and street together. When nothing matches, the request used to carry the typed name, phone and street itself (`service_requests.contact_name`, `contact_phone`, `contact_address`) and wait in the Needs Review queue. The columns were filled only for those requests. The same visitor asking twice, or asking for two services, had their details copied onto every request, and staff matched each request by hand. The database had no record of a person who had made contact but was not yet a customer, and Mason noticed that gap in the ERD.

## Decision drivers

- Keep typed details once, not on every request.
- A repeat visitor should be recognizable, so staff can deal with the person once.
- Do not weaken what ADR 0012 promises: a match and a miss look the same to the visitor.
- A deploy runs `pnpm migrate` before the new code starts, so the change has to survive old and new code being live for a moment.
- Real names and numbers are never committed, so the backfill has to be tested with made-up ones.

## Decision

- **A `leads` table.** A lead has the typed `name`, `phone` and `address`, a match key for each (`*_normalized`), a nullable `customer_id`, and `created_at`. The three keys are `UNIQUE` together. `customer_id` is set when staff turn the lead into a customer, and is `ON DELETE SET NULL`.
- **The address lives on the lead.** The key is name, phone and street together, the same three `/schedule` already matches a customer on. One person who types two streets is two leads.
- **Requests point at a lead.** `service_requests.lead_id` is nullable with no delete action, so a lead that still has requests cannot be deleted. An unmatched request must have a lead, and the CHECK says so. A matched request needs a customer and a property and may keep its lead, which records where the customer came from.
- **Find or create in one statement.** `INSERT ... ON CONFLICT ... DO UPDATE SET name = leads.name RETURNING id`, so two visitors who submit the same details at the same moment get one lead. The lead and the request are made in two statements, not one transaction. A failure between them leaves a lead with no request, which is harmless and is reused next time.
- **Converting a lead matches all of its open requests.** Matching one request, to an existing property or as a new customer, attaches that lead's other Needs Review requests to the same customer and property in the same transaction, and sets `leads.customer_id`. A request cancelled before it was matched is left alone. The match page shows how many others will follow. The lead row is locked before any request row, so two staff matching different requests of one lead queue on the lead and cannot deadlock.
- **Expand, then contract.** Migration 025 adds the table and `lead_id`, relaxes the CHECK to accept either shape and keeps the `contact_*` columns. Migration 026 drops the columns once no code reads them and puts the strict CHECK in place. The CHECK is checked against every existing row, so 026 fails and rolls back if any unmatched request has no lead.
- **A lead goes with its customer.** `leads.customer_id` is `ON DELETE CASCADE` (migration 027; 025 had `SET NULL`, which kept the typed name, phone and street after a delete). `service_requests.lead_id` is `ON DELETE SET NULL`, not `CASCADE`, because a lead can have requests matched to a different customer (a person who moved, or a lead matched by hand to two customers), and deleting one customer must not delete another's request. An unmatched request has no customer and needs its lead, so the code that deletes customers (`src/models/customer.js`: `remove` and `clear`) first deletes the unmatched requests of the leads about to go, in the same transaction. A delete path that forgets this fails on the CHECK instead of keeping the details. The single-customer and bulk delete pages count the leads, and the bulk delete's refusal when counts changed covers them. A lead of a visitor who never became a customer is not customer data and stays, like the unmatched requests it points at.
- **The backfill is SQL.** Migration 025 makes one lead per distinct person and address among requests that carried typed details, from the earliest request's text, and points those requests at it. Requests that were already matched get a lead too, marked converted to their customer, so the typed text is not lost when the columns go. The match keys are worked out by SQL functions that follow `personKey`, `normalizePhone` and `normalizeAddress`, apart from letters with accents. `src/db/leadBackfill.test.js` compares them with the JavaScript on made-up examples.

## Alternatives considered

- **A flag on `customers` (a lead is a customer with `is_lead`).** Rejected: the import, rebooking, Messenger batches, link batches and deletion all treat `customers` as real customers, and each would need a filter to leave half-known people out.
- **Keep the `contact_*` columns and add `lead_id`.** Rejected: the duplication stays, which is what this removes.
- **Leads keyed on name and phone, with the address on each request.** Rejected for now: one lead per person, but the request would still carry typed text, and `/schedule` matches on the street, so a lead and a customer would be matched by different rules. Easy to revisit if two-address visitors turn out to be common.
- **Add email.** Not done: the public form does not ask for one.
- **Do the backfill in a script after deploy.** Rejected: the migration drops the columns, and a script that has to run between two migrations is a step to forget.
- **Fuzzy matching of leads.** Rejected for the reasons in ADR 0016: a typo or nickname would merge different people. Exact after normalization, as for customers.

## Consequences

- A visitor who asks again, even with different capitalization or "St." for "Street", is the same lead, and staff match all their open requests at once.
- Typos make new leads. One person who types two streets is two leads.
- Backfilled leads have keys from the SQL functions. Where those differ from the JavaScript (accented letters), the same person asking again gets a second lead until staff match both. Nothing is lost.
- `pnpm names:renormalize` does not recompute lead keys. If the name rules change again, leads keep their old keys.
- Deleting a customer deletes their leads and those leads' unmatched requests, so what a person typed does not outlive them. Migration 025 alone did not do this, and it was found and fixed before the branch was committed. A delete racing a new request on the same converted lead can fail on the CHECK; the delete is rolled back and can be repeated.
- A lead that has been converted to a customer still catches a later visitor who types the same name, phone and street but matches no customer (the customer's details changed since). That request attaches to the converted lead as an unmatched request, and deleting the customer deletes it too. This is intended: the details came from the same person, so they go with them.
- A request matched to another customer only loses its link to the lead. The lead's typed details are gone with the deleted customer, and the other customer's request is otherwise untouched.
- There is no page for leads. Staff see a lead only through its Needs Review requests. A lead whose requests were all cancelled before matching is kept and reachable only in the database.
- The live backfill has not been seen. The count of leads, and any odd typed names, should be checked after the first deploy.
- The FigJam copy of the ERD is out of date. Nothing updates it.

## References

- `migrations/025_create_leads.sql`, `migrations/026_drop_request_contact_columns.sql`, `migrations/027_leads_go_with_their_customer.sql`, `src/models/lead.js` and `src/models/staff.js` (`attachWithLead`, `lockLeadOf`).
- Tests: `src/models/lead.test.js`, `src/db/leadBackfill.test.js`, `src/leadDelete.test.js`, and the matching tests in `src/staff.test.js` and `src/requests.test.js`.
- [ADR 0012](0012-customer-access-by-link.md) for the generic link and the Needs Review queue. [ADR 0016](0016-person-name-rules.md) for the name key.
- [Process doc](../process/customer-lifecycle.md), steps 3 and 6. [Database ERD](../architecture/database-erd.md).
