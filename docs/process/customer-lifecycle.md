# Customer Lifecycle: From Import to Route

**Last verified:** 2026-11-03 against the code on `main`.

This is the end-to-end process as the app does it today: how a customer gets onto the list, hears about service, picks a day, is booked, and is driven to. It is a living document. Processes change, so the sections below say where each step lives in the code, and a test keeps the page paths in this file honest.

## How to keep this current

- **Change the process, change this file in the same pull request.** Any work that adds, removes or renames a page in the steps below, or changes who may do a step, a rule, or a status, updates this file.
- **A test enforces the paths.** `src/processDoc.test.js` fails if a page path written in backticks here is not a real route, and if a route under the process areas listed in that test is missing from this file. When it fails, fix the doc, or fix the route if the doc was right.
- **Write what is true, not what is planned.** Planned work goes in the [roadmap](../product/roadmap.md). Anything not built is marked as a gap.
- **Update the date above** only after re-reading the steps against the code, not when only a typo is fixed.
- **Record the change** in the list at the bottom.

## The people

| Role | Does |
| --- | --- |
| Owner | Everything a dispatcher does, plus import, clearing customers, users and the service catalog |
| Dispatcher | Areas and days, links, matching, the day board, routes |
| Customer | Opens a link or logs in, requests service, picks a day, cancels, reviews |

## Owner options

The owner sets company-wide options at `/admin/settings` (saved by posting there). There is one so far: **Allow booking customers who have not confirmed**, off by default. Off means the day board and the route builder deal only with jobs the customer asked for. On means staff may pencil in a customer who has not picked a day, as a tentative booking. The option is stored in `app_settings` and read on every request, so a change takes effect at once. Tentative booking itself is not built yet, so turning this on changes nothing until it is.

## The status of a request

`Needs Review`, `Requested`, `Scheduled`, `Completed`, `Cancelled`. The moves staff can make are in `src/utils/transitions.js`: Needs Review goes to Requested (by matching) or Cancelled, Requested goes to Scheduled or Cancelled, Scheduled can be rescheduled or go to Completed or Cancelled, and Completed and Cancelled are final.

## 1. Import customers

- **Who:** owner.
- **Where:** `/admin/import`, then `/admin/import/mapping`, `/admin/import/preview` and `/admin/import/confirm`. The result of a run is at `/admin/import/batches/:id`.
- **What happens:** the owner pastes a public Google Sheet link, picks a tab, maps the columns and sees a read-only preview. Confirming writes customers, properties and past jobs in one transaction. Running it twice changes nothing.
- **Rules:** a row with no city keeps its street and is flagged. Customers are matched on normalized name, phone and street. The import creates areas from the sheet's area column but never adds days.
- **Undo:** the owner can clear customers by import batch (`/admin/clear/batches/:id`) or all at once (`/admin/clear/all`), starting from `/admin/clear`. Each shows what would go first.
- **Code:** `src/import/`, `src/controllers/import.js`.
- **Gaps:** no `.xlsx` upload.

## 2. Set up areas and their days

- **Who:** owner, dispatcher.
- **Where:** `/staff/areas` and `/staff/areas/:id`. Days are added at `/staff/areas/:id/days` and removed at `/staff/areas/:id/days/delete`. A property is put in an area on `/staff/properties/:id/edit`.
- **What happens:** staff list the dates they will work each area. A date is stored on its own, so one week can be skipped without a rule.
- **Rules:** a customer whose property has an area with upcoming days can only request one of those days. A property with no area, or an area with no upcoming days, can still request, and the date is a preference.
- **Code:** `src/models/area.js`, `src/controllers/areas.js`.

## 3. Make the links

- **Who:** owner, dispatcher.
- **Where:** for a whole area, `/staff/link-batches/new` then `/staff/link-batches`. For one customer, `/staff/customers/:id/links`, revoked at `/staff/customers/:id/links/:linkId/revoke`.
- **What happens:** one link per customer, shown once on the result page and as a CSV. Only a hash is stored. By default a customer who already has a working link is skipped, and customers with no usable phone are listed, not linked. A batch holds at most 500 links and lasts 1 to 120 days (30 by default). Each run is recorded in `link_batches`.
- **The generic link:** `/schedule` is one public page for anyone. Name, phone and street that all match a customer create a Requested request. No match creates a Needs Review request. The visitor sees the same page either way.
- **Code:** `src/models/linkBatch.js`, `src/models/accessLink.js`.

## 4. Send the links

- **Who:** staff, outside the app.
- **What happens:** staff copy the list into their own texting tool. The app sends nothing.
- **Gaps:** sending is parked (Sprinkler Messenger, [#37](https://github.com/masontuft/routemaster/issues/37)). There is no record of which links were actually texted.

## 5. The customer picks a day

- **Who:** customer.
- **Where:** `/l/:token` shows a Continue button, and its POST signs the customer in. Opening the link alone logs nobody in, because email scanners open links. Then `/requests/new` creates the request. After that the customer can use `/requests`, `/requests/:id`, `/requests/:id/edit` and `/requests/:id/cancel`, and `/properties/new` (saved by posting to `/properties`) to add a property. A visitor without a link uses `/schedule`, `/schedule/date` and `/schedule/thanks`.
- **What happens:** the customer chooses a property, a service and a day. The request is created as Requested with `preferred_date`. A customer can change the date or cancel only while it is still Requested.
- **Rules:** the server refuses a day outside the property's area days when the area has them.
- **Code:** `src/controllers/link.js`, `src/controllers/requests.js`.

## 6. Match, then book the day

- **Who:** owner, dispatcher.
- **Matching:** a Needs Review request is matched to an existing customer or made into a new one at `/staff/requests/:id/match` and `/staff/requests/:id/match/new`. Until it is matched it cannot be scheduled.
- **One at a time:** `/staff/requests` lists requests, `/staff/requests/:id` shows one, and `/staff/requests/:id/status` moves it, with a date when scheduling.
- **Many at once, the day board:** `/staff/day-board` shows the Requested jobs that asked for a day, grouped by area and street, with the jobs already booked for it. `/staff/day-board/schedule` books the ticked ones. Each is a normal status change to Scheduled with `scheduled_date`, and a history entry. Only Requested jobs are booked there, at most 200 at a time, and a day in the past is refused.
- **Code:** `src/models/dayBoard.js`, `src/models/staff.js`.

## 7. Build the route

- **Who:** owner, dispatcher.
- **Where:** `/staff/routes`, with `/staff/routes/locate` and `/staff/routes/build`.
- **What happens:**
  1. Find Locations looks up a map point for each booked address (Google when a key is set, then Nominatim) and saves it on the property. At most 15 per click.
  2. Addresses that were not found are listed with a link to fix them. A job without a point is left off the route.
  3. Build Route takes a start address, a start time and minutes per stop, orders the stops with nearest-neighbor and a 2-opt pass, times them, and saves one route for the day. Building again replaces it.
- **Output:** a table with arrival time, phone and notes for each stop, the total miles and drive time, and Google Maps links split into parts. The page warns if the day's booked jobs changed after the route was built.
- **Rules:** distances are straight-line, so times are estimates.
- **Code:** `src/routing/engine.js`, `src/geocoding/`, `src/models/routePlan.js`.
- **Gaps:** one route and one starting point per day. No print or export. Technicians cannot see routes.

## 8. The day, and afterward

- **Who:** staff, then the customer.
- **What happens:** staff drive the route and move each request to Completed on `/staff/requests/:id/status`. A customer with a Completed request can write a review at `/requests/:id/review`, and can delete their own review at `/requests/:id/review/delete`. Staff moderate reviews at `/staff/reviews`.
- **Gaps:** the app has no technician login, so completion is marked by staff.

## Known gaps in the whole process

- Sending links is manual and unrecorded.
- A Completed or Cancelled request cannot be booked again, and there is no way yet to reach last season's customers to rebook them. See the [roadmap](../product/roadmap.md).
- There is no per-day capacity limit, so a day can be over-booked.
- The route builder has been tested with fake map responses and not yet with real addresses.

## Changes to the process

| Date | Change |
| --- | --- |
| 2026-11-03 | Added the owner option for tentative booking (setting and flag only; the booking itself comes next). |
| 2026-11-03 | First version. Covers import through route, as built on `main` after pull request 55. |
