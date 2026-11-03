# ADR 0013: Route Ordering and Map Lookups

## Status

Proposed. Mason approved the plan on 2026-11-03. It stays Proposed until the route builder has been tried with real addresses and the map services, which have only been tested with fake responses.

## Date

2026-11-03

## Context

Staff book a day's jobs and then need an order to visit them in, with times. The original tool was a Python script (`route_optimizer.py` in the TSB project) that read a CSV, geocoded each address with Google and then Nominatim, ordered stops by nearest-neighbor, and printed a schedule and a Google Maps link. The web app already stores customers, properties and booked jobs, so it should build the route from those.

## Decision drivers

- Stay in the repo's plain JavaScript, with no new dependency.
- Test the ordering and timing without a database or network.
- Do not look up the same address twice, and do not send customer addresses to a service more than needed.
- Never lose a customer silently when an address cannot be found.
- Keep API keys and the starting address out of the source.

## Decision

- **Port to JavaScript** in `src/routing/engine.js` (pure functions) and `src/geocoding/` (lookups). The Python script is not run by the app.
- **Order with nearest-neighbor, then 2-opt.** Nearest-neighbor builds a route quickly. 2-opt then tries driving each stretch backwards and keeps any change that shortens the route, which removes crossing legs. The start is fixed and the end is free, because the crew finishes at the last customer.
- **Straight-line distance** (haversine). Times use the script's rule: 2 minutes per mile plus a 5-minute buffer, at least 5, with a fixed time at each stop. Times are whole minutes since midnight, never `Date` objects.
- **Look up once and keep it.** `properties` stores latitude, longitude and a status of pending, ok or failed. Changing the street, city or ZIP clears the point. A lookup that errors (network, quota, bad key) leaves the property pending; only a real "nothing found" marks it failed.
- **Google first, Nominatim second.** Google is used only when `GOOGLE_MAPS_API_KEY` is set, and an `APPROXIMATE` result is not trusted. Nominatim calls are spaced 1.1 seconds apart to follow its usage policy. The key never appears in an error or result.
- **One route per day, stored by reference.** `routes` and `route_stops` keep the order and times and point at the service requests. Names, phones and addresses are read live.
- **Map links are chained.** Google's link format takes up to 9 stops between the start and end, so a long day becomes several links, each starting where the last stopped.
- **Configuration** comes from `GOOGLE_MAPS_API_KEY`, `SERVICE_STATE` and `ROUTE_START_ADDRESS`, all optional.

## Alternatives considered

- **Run the Python script.** Rejected: a second runtime to deploy, and it works from a CSV, not the database.
- **Google Directions or Distance Matrix for road times.** Better estimates, but it needs a key, costs per request, and sends every pair of addresses out. Left as a later upgrade.
- **Exact solvers or Or-tools.** Overkill for a day of a few dozen stops, and a new dependency.
- **Nearest-neighbor only**, as the script did. Rejected: it can leave a long trip back across the map at the end.
- **Copy customer details into the route.** Rejected: they would go stale after an edit.
- **Geocode every time a route is built.** Rejected: slower, costs quota, and re-sends addresses.

## Consequences

- Routes are good, not provably shortest, and drive times are estimates.
- Customer street, city and ZIP are sent to Google and OpenStreetMap. That is a new trust boundary, recorded in the [threat model](../security/threat-model.md).
- A day with more than 15 unlocated addresses takes more than one click.
- Two crews on one day, a printed or exported route, and technician views are not covered.

## References

- Google Maps URLs documentation (the `api=1` form and its waypoint limit) and the Nominatim usage policy were not re-opened while writing this ADR; check both before relying on the limits (9 waypoints, one request a second).
- The original script: `route_optimizer.py` in the TSB project.
