# ADR 0001: App Type and Repo Shape

## Status

Accepted

## Date

2026-10-30

## Context

Routemaster is a web app for service companies that builds daily routes and pairs well with Sprinkler Messenger. It is being built as Mason's CSE 340 final project, Option A (design your own). The course requires a server-side rendered Express app, one GitHub repository and one Render deployment. Mason's current business data lives in a Google Sheet of sprinkler blowout jobs.

## Decision drivers

- The course grades one repository and one live deployment.
- The course requires three roles: an owner or admin, a secondary role, and a standard user.
- The course requires a customer-facing interaction (user submissions) and a multi-stage workflow.

## Decision

- Product: a customer-facing site with staff dashboards for a single company. Customers submit service requests. Dispatchers build daily routes from those requests. The owner manages everything.
- App type: one server-side rendered web application.
- Repo shape: one repository, one deployable.
- Tenancy: single company. Multi-tenant support is a post-course goal and is on the roadmap.

## Alternatives considered

- An internal-only tool for owner, dispatcher and technician. Rejected because the standard-user role and the reviews requirement fit poorly.
- Multi-tenant from day one. Rejected for scope: every table and query would need a tenant column, and tenant isolation becomes a security surface.

## Consequences

- The three course roles map to owner, dispatcher and customer.
- Nothing is built yet. Everything in this ADR is Not currently implemented.
- Open question: whether technicians need their own logins or are only names a dispatcher assigns to routes.

## References

- Final Project Requirements (course document supplied by Mason).
