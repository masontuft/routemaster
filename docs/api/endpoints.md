# Endpoints

No JSON API exists. Page routes are not designed yet, so none are listed. When routes are built, list each with method, path, required role, and the form fields it accepts. Not currently implemented.

## Staff pages (owner and dispatcher)

A visitor is redirected to `/login`. A customer gets a 403. Every POST needs the `_csrf` field.

| Method | Path | Fields | What it does |
| --- | --- | --- | --- |
| GET | `/staff` | | Counts by status and the newest Needs Review requests |
| GET | `/staff/requests` | `status` (optional; unknown values are ignored) | Request list |
| GET | `/staff/requests/:id` | | Details, history and the allowed next statuses |
| POST | `/staff/requests/:id/status` | `status`, `scheduledDate` (required for Scheduled), `note` | Apply a transition from the table in `src/utils/transitions.js` |
| GET | `/staff/requests/:id/match` | `q` | Search customers for a Needs Review request |
| POST | `/staff/requests/:id/match` | `propertyId` | Attach the request to an existing customer's property |
| POST | `/staff/requests/:id/match/new` | `city`, `zip` | Create a customer and property from the typed details |
| GET | `/staff/customers` | `q` | Search by name, phone or street |
| GET | `/staff/customers/:id` | | Properties, requests and links |
| POST | `/staff/customers/:id/links` | | Create a link, shown once in the response |
| POST | `/staff/customers/:id/links/:linkId/revoke` | | Revoke a link |
