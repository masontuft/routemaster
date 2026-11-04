# ADR 0014: Rebooking and Tentative Bookings

## Status

Proposed. Mason approved the plan on 2026-11-03. It stays Proposed until the flow has been tried with real data in a browser.

## Date

2026-11-03

## Context

The service is annual. After the first season, the work is reaching existing customers again, and some companies will want to pencil in a customer for a day before that customer has answered. A customer picking a day is what confirms they want the service, so a booking made without that needs to be clearly marked.

## Decision drivers

- Reuse the links, the day board and the route builder that already exist.
- Never lose the history of a finished job, its review or the monthly stats.
- Let each company choose whether unconfirmed bookings are allowed.
- Do not send anything automatically.

## Decision

- **Rebooking is a list and targeted links.** `/staff/rebooking` sorts the customers of one area, or of all areas, for one year, into not yet booked, declined, never served and already booked, from their requests alone. Links are made for the ticked customers with the same link maker as a batch. Contacted is derived from links already made, so there is no new table.
- **A year is the year of the day a request was booked for** (`scheduled_date`, or `preferred_date` if never booked). A calendar year is the season.
- **A new request each season.** Rebooking creates a new request. It does not reopen a Completed or Cancelled one, which stay final.
- **Tentative is a flag.** `service_requests.tentative` marks a Scheduled request staff made without the customer asking. The customer confirms it, picks a different day (which drops it back to Requested), or declines it. Staff can mark it confirmed. Completing or cancelling clears the flag.
- **One owner option.** `app_settings` holds `allow_tentative_booking`, off by default and stored as text from a fixed list of allowed values. Off hides pencil-ins and leaves tentative jobs off routes.
- **The server decides the booking.** The form carries customer ids and a day. The server picks the property in an area that works the day and the last service done, and refuses any customer who is not in the not-yet-booked group for that year (never served, declined or already booked), inside a transaction with the customer row locked. The customer's own booking path takes the same lock, so the two cannot interleave.
- **An area city.** `subdivisions.city` fills in for a property with no city when looking up an address.

## Alternatives considered

- **Reopen Completed and Cancelled requests.** Rejected: it breaks the completed counts and review rule, and overrides a customer's own cancel.
- **A separate tentative bookings table.** Rejected: the day board, route and history already work on requests, and a flag keeps one code path.
- **A per-visit checkbox instead of an owner option.** Rejected for now: the policy is the company's, not the visit's.
- **Season and visit-frequency settings now.** Deferred to the roadmap, because the first company serves once a year on a calendar year.
- **Send a message when a customer is penciled in.** Out of scope: sending is parked.

## Consequences

- A service done twice a year, or a season spanning New Year, is not handled yet.
- A penciled-in customer learns of it only by opening their link, which may have expired.
- Links for all areas are made one batch per area, by each customer's first property, so a customer with properties in several areas is linked once but under the first one; a property type would choose better. A long list of small areas makes a long result page until areas are tidied.
- Settings keep only the last editor, with no history.

## References

- [The process doc](../process/customer-lifecycle.md), steps 6, 7 and 9.
- [ADR 0012](0012-customer-access-by-link.md) for the links this builds on.
