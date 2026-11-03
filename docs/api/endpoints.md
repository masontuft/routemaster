# Endpoints

No JSON API exists. The tables are the HTML routes that exist. Every POST needs the `_csrf` field. Routes that are not in a later table are in the two sections below.

## Public and account pages

| Method | Path | Role | Fields | What it does |
| --- | --- | --- | --- | --- |
| GET | `/` | public | | Home |
| GET | `/health` | public | | Body `ok` (200) when `SELECT 1` succeeds, otherwise 503 |
| GET | `/__dev/boot` | dev reload only | | Boot id as text. 404 when dev reload is off |
| GET, POST | `/register` | public | `email`, `password`, `confirm` | Creates a customer and starts a session |
| GET, POST | `/login` | public | `email`, `password` | POST is rate limited |
| POST | `/logout` | any visitor | | Ends the session and redirects home |
| GET | `/l/:token` | public | | Continue button. GET does not log anyone in |
| POST | `/l/:token` | public, rate limited | | Redeems the magic link |
| GET, POST | `/schedule` | public | `name`, `phone`, `address` | Identify. POST is rate limited |
| GET, POST | `/schedule/date` | public | `serviceTypeId`, `preferredDate` | Pick a service and date. POST is rate limited |
| GET | `/schedule/thanks` | public | | Confirmation |

## Customer pages

A visitor is redirected to `/login`. Another role gets a 403. `requireRole("customer")` and `ensureCustomer` cover `/requests` and `/properties`.

| Method | Path | Fields | What it does |
| --- | --- | --- | --- |
| GET | `/requests` | | The customer's requests |
| GET | `/requests/new` | `propertyId` (optional) | New-request form for one property (the first when none is given). Lists that property's area days; with none set, the form takes a preferred date and says it is not confirmed |
| POST | `/requests` | `serviceTypeId`, `propertyId`, `preferredDate`, `notes` | Create a request. When the property's area has upcoming days, `preferredDate` must be one of them (400 otherwise); when it has none, any valid date is accepted as a preference |
| GET | `/requests/:id` | | One request, including its review |
| GET, POST | `/requests/:id/edit` | `preferredDate`, `notes` | Edit while the request is still Requested. The same area-day rule applies; the request's current date is always allowed, so a notes-only edit works |
| POST | `/requests/:id/cancel` | | Cancel while the request is still Requested |
| GET | `/properties/new` | | New-property form |
| POST | `/properties` | `street`, `city`, `zip`, `notes` | Add a property |

## Staff pages (owner and dispatcher)

A visitor is redirected to `/login`. A customer gets a 403. Every POST needs the `_csrf` field.

| Method | Path | Fields | What it does |
| --- | --- | --- | --- |
| GET | `/staff` | | Counts by status and the newest Needs Review requests |
| GET | `/staff/requests` | `status` (optional; unknown values are ignored) | Request list |
| GET | `/staff/requests/:id` | | Details, history and the allowed next statuses |
| POST | `/staff/requests/:id/status` | `status`, `scheduledDate` (required for Scheduled), `note` | Apply a transition from the table in `src/utils/transitions.js` |
| POST | `/staff/requests/:id/referrer` | `referredBy` | Record who referred the job, or clear it. Payouts are not stored |
| GET | `/staff/requests/:id/match` | `q` | Search customers for a Needs Review request |
| POST | `/staff/requests/:id/match` | `propertyId` | Attach the request to an existing customer's property |
| POST | `/staff/requests/:id/match/new` | `city`, `zip` | Create a customer and property from the typed details |
| GET | `/staff/customers` | `q`, `needs=city` (optional) | Search by name, phone or street; `needs=city` keeps customers with a property that has no city |
| GET | `/staff/customers/:id` | | Properties, requests and links |
| GET, POST | `/staff/customers/:id/edit` | `name`, `phone`, `email` | Owner edits all three; a dispatcher edits phone and email. A posted field the role may not change is a 403 and nothing is saved |
| POST | `/staff/customers/:id/properties` | `street`, `city`, `zip` | Add a property; the city is required for one made by hand |
| GET, POST | `/staff/properties/:id/edit` | `street`, `city`, `zip`, `notes`, `subdivisionId` | Owner edits all five; a dispatcher edits city, ZIP, notes and the area (blank clears it). A blank city or ZIP is allowed |
| GET | `/staff/link-batches/new` | `areaId`, `includeActive` (optional) | Choose an area and see how many links a batch would make, skip or list as having no usable phone. Makes nothing. No-store |
| GET | `/staff/day-board` | owner, dispatcher | `day` (optional, `YYYY-MM-DD`, default today) | Requests waiting for that day, those already booked for it, and days with waiting requests |
| POST | `/staff/day-board/schedule` | owner, dispatcher | `day` (today or later), `requestIds` (one or many, at most 200) | Book each ticked Requested job for the day; others are counted as skipped |
| GET | `/staff/routes` | owner, dispatcher | `day` (optional) | Booked jobs with map-point counts, addresses to fix, the build form, and the saved route with map links |
| POST | `/staff/routes/locate` | owner, dispatcher, rate limited | `day`, `retryFailed` (optional `1`) | Look up map points for up to 15 booked jobs that have none |
| POST | `/staff/routes/build` | owner, dispatcher, rate limited | `day`, `startAddress` (5 to 200), `startTime` (`HH:MM`), `serviceMinutes` (5 to 120) | Order the located stops, time them, and save the day's route (replaces any earlier one) |
| POST | `/staff/link-batches` | `areaId`, `days` (1 to 120), `template` (must contain `{link}`), `includeActive` | Make one link per eligible customer in the area in one transaction and show them once, as a table and a CSV. More than 500 is a 400; an unknown area is a 404. Shared per-IP limit, CSRF, no-store |
| GET, POST | `/staff/areas` | `name` | List areas with property and upcoming-day counts; create an area (400 for a blank or duplicate name) |
| GET, POST | `/staff/areas/:id` | `name` | The area's upcoming days and entry forms; POST renames it (400 if another area has the name) |
| POST | `/staff/areas/:id/days` | `day`, or `weekday` (0 is Sunday), `from`, `to` | Add one date, or every chosen weekday between two dates. Dates must be today or later and within a year; a date already there is skipped |
| POST | `/staff/areas/cities` | owner, dispatcher | fields named `city_<area id>` (up to 100 characters, blank clears) | Set many area cities at once; one bad value saves none (400). A changed city sends the area's city-less properties back to be looked up |
| GET | `/staff/rebooking` | owner, dispatcher | `areaId`, `year` (optional) | Customers in the area sorted into not yet booked, declined, never served and already booked, with the last service date and link status |
| POST | `/staff/rebooking/links` | owner, dispatcher, rate limited | `areaId`, `year`, `customerIds` (one or many), `days` (1 to 120), `template` (must contain `{link}`), `includeActive` | Make links for just the ticked customers; ids outside the area are ignored. Shown once, like a link batch |
| POST | `/staff/day-board/pencil` | owner, dispatcher | `day` (today or later), `customerIds` (one or many, at most 200) | Pencil customers in as tentative Scheduled requests. Refused (400) unless the owner option is on |
| POST | `/staff/requests/:id/confirm` | owner, dispatcher | | Mark a tentative booking confirmed; no effect on any other request |
| POST | `/requests/:id/confirm` | customer | | The customer confirms their own tentative booking (404 for someone else's) |
| GET, POST | `/admin/settings` | owner | `allowTentative` (`1` for on) | Show and save the company-wide scheduling options |
| POST | `/staff/areas/:id/days/delete` | `day` | Remove one day (404 if it is not there) |
| GET, POST | `/staff/customers/:id/delete` | | Owner only (403 for a dispatcher). The GET lists what will be deleted with the customer; the POST deletes the customer and, by cascade, their properties, requests, status history, reviews and links, then redirects to `/staff/customers` |
| POST | `/staff/customers/:id/links` | | Create a link, shown once in the response |
| POST | `/staff/customers/:id/links/:linkId/revoke` | | Revoke a link |

## Owner pages (owner only)

A visitor is redirected to `/login`. A dispatcher or customer gets a 403. Every POST needs `_csrf`.

| Method | Path | Fields | What it does |
| --- | --- | --- | --- |
| GET | `/admin/users` | | Users with role and a role selector |
| POST | `/admin/users/:id/role` | `role` | Change a role. Refused for yourself, a link-only customer, an unknown role, or the last owner |
| GET | `/admin/users/new` | | Staff user form |
| POST | `/admin/users` | `email`, `role` (owner or dispatcher), `password`, `confirm` | Create a staff user |
| GET | `/admin/service-types` | | Services with price and active flag |
| GET | `/admin/service-types/new`, `/admin/service-types/:id/edit` | | Service form |
| GET | `/admin/clear` | `deleted` (optional) | Owner only. Lists import batches with the customers each still has on file, and links to the delete pages |
| GET, POST | `/admin/clear/batches/:id` | `customers`, `properties`, `requests`, `reviews`, `links` | Confirm page, then delete the customers that import batch created. The POST carries the counts the owner saw and is refused with 409 if they no longer match |
| GET, POST | `/admin/clear/all` | the same five counts, `phrase` | Confirm page, then delete every customer. The phrase must be `delete all customers` (400 otherwise); a changed count is a 409 |
| GET | `/admin/import` | | Form for a public Google Sheet link (owner only) |
| POST | `/admin/import` | `link` | Download and parse the sheet, then list each tab with its row and column counts. Nothing is saved. Owner only, CSRF, shared per-IP limit. Bad input returns 400, a Google or network failure returns 502 |
| POST | `/admin/import/mapping` | `sheetId`, `sheet`, `headerRow` (optional), plus `seasonYear` and `col_<field>` to keep earlier choices | Download the sheet again and show the column mapping form for one tab. Owner only, CSRF, shared per-IP limit |
| POST | `/admin/import/preview` | `sheetId`, `sheet`, `headerRow`, `seasonYear`, `serviceTypeId`, `statusName` (Requested, Scheduled, Completed or Cancelled), `defaultCity`, `col_name`, `col_street` (required), `col_phone`, `col_city`, `col_zip`, `col_date`, `col_amount`, `col_area`, `col_notes` | Download the sheet again, apply the mapping, and show what confirming would do. Reads the database and writes nothing. Bad input returns 400 with a fixed message |
| POST | `/admin/import/confirm` | the preview fields plus `planHash` | Download the sheet again, recompute the plan inside one transaction under an advisory lock, and write only if its hash equals `planHash`. Success redirects (303) to the batch page. A changed sheet or database returns 409 with a fresh preview and writes nothing |
| GET | `/admin/import/batches/:id` | | Counts for one confirmed import. An unknown id is 404. Every `/admin/import` response is `Cache-Control: no-store` |
| POST | `/admin/service-types`, `/admin/service-types/:id` | `name`, `price` (dollars), `active` | Add or update a service. Deactivate by unchecking active |

`GET /staff` also shows requests received, completed this month, and the value of scheduled jobs when the viewer is an owner.

## Reviews and contact

| Method | Path | Role | Fields | What it does |
| --- | --- | --- | --- | --- |
| GET | `/services` | public | | Active services; a price shows only when above $0, otherwise "Contact us for pricing" |
| GET | `/reviews` | public | | Visible reviews with the average rating; authors shown as "First L." |
| GET | `/requests/:id/review` | customer | | Review form for the customer's own Completed request (404 otherwise) |
| POST | `/requests/:id/review` | customer | `rating` (1 to 5), `body` (up to 1000) | Create or edit the review |
| POST | `/requests/:id/review/delete` | customer | | Delete the customer's own review |
| GET | `/contact` | public | | Contact form |
| POST | `/contact` | public, rate limited | `name`, `email`, `phone` (optional), `message` (up to 2000) | Save a message |
| GET | `/staff/reviews` | owner, dispatcher | | All reviews including hidden |
| POST | `/staff/reviews/:id/hide`, `/restore` | owner, dispatcher | | Flag or unflag a review |
| POST | `/staff/reviews/:id/delete` | owner | | Delete a review permanently |
| GET | `/staff/messages`, `/staff/messages/:id` | owner, dispatcher | | Message list and detail |
| POST | `/staff/messages/:id/reply` | owner, dispatcher | `note` (up to 1000) | Record a reply and mark the message Replied |
