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
| POST | `/admin/service-types`, `/admin/service-types/:id` | `name`, `price` (dollars), `active` | Add or update a service. Deactivate by unchecking active |

`GET /staff` also shows requests received, completed this month, and the value of scheduled jobs when the viewer is an owner.
