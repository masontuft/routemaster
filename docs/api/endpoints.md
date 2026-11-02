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
| GET | `/requests/new` | | New-request form |
| POST | `/requests` | `serviceTypeId`, `propertyId`, `preferredDate`, `notes` | Create a request |
| GET | `/requests/:id` | | One request, including its review |
| GET, POST | `/requests/:id/edit` | `preferredDate`, `notes` | Edit while the request is still Requested |
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
| GET | `/staff/customers` | `q` | Search by name, phone or street |
| GET | `/staff/customers/:id` | | Properties, requests and links |
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
