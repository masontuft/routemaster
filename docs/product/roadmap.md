# Roadmap

Post-course or optional.

- Email or text delivery of customer links. The staff pages already create and revoke links and work the Needs Review queue.
- Send customer links in bulk through Sprinkler Messenger, the companion React Native app, using a deep link that opens the app and its mass-text feature on the dispatcher's phone. Viability is not confirmed: it depends on Messenger sending a different message to each customer and on iOS and carrier limits. Spec: [docs/integrations/sprinkler-messenger.md](../integrations/sprinkler-messenger.md). Open questions: [issue 37](https://github.com/masontuft/routemaster/issues/37).
- Branded business workspaces (multi-tenant). Planned, not a commitment. See [Branded Business Workspaces](#branded-business-workspaces).
- Import of expenses, mileage and compressor schedule tabs.
- Export to `.xlsx`, then two-way spreadsheet sync via an admin button (needs Google OAuth or a service account).
- An instructor-hosted database as an optional target for server agents.
- Referral payout model for Rocky and Skyview, once the rule is understood ([#35](https://github.com/masontuft/routemaster/issues/35)).
- Technician logins, if wanted ([#34](https://github.com/masontuft/routemaster/issues/34)).

## Branded Business Workspaces

**Status:** Planned. Future work, and not a commitment. Not currently implemented. This page does not change the single-company decision in [ADR 0001](../adr/0001-app-type-and-repo-shape.md).

A business signs up with Routemaster and is allocated its own workspace. That workspace includes a mirrored copy of the customer-facing service sign-up, branded for that business. A way for each business to customize that branding is part of the same plan.

The flow being mirrored is the public service sign-up a customer uses today: the generic `/schedule` page in [ADR 0012](../adr/0012-customer-access-by-link.md), where a visitor enters a name, phone, and street and submits a preferred date.

**User value.** Another service company can take requests under its own name. Its customers see that company's branding. Its workspace is its own, so its customers and requests are not mixed with another business's.

**Rough scope.**

- Business sign-up that allocates a workspace.
- A per-business workspace with data isolated from other businesses.
- A branded mirror of the customer-facing service sign-up.
- A customization layer for that branding. Examples only, until the open questions below are answered: logo, colors, copy, and possibly a subdomain or a path.

**Open questions.**

- TODO (Mason): How tenants are isolated. A `tenant_id` column on shared tables, a schema per business, and a database per business are all open. ADR 0001 rejected multi-tenant on day one because a tenant column would touch every table and query, and isolation would be a security surface. That rejection does not choose the later design.
- TODO (Mason): The URL scheme for a branded sign-up. A subdomain and a path are both open.
- TODO (Mason): Pricing or plans. Nothing is decided, including whether a business pays, and no price should be invented.
- TODO (Mason): What a business can customize. Logo, colors, and copy are examples, not a decided list.
- TODO (Mason): How a workspace interacts with the existing owner admin and the owner, dispatcher, and customer roles. Whether each business has its own owner, and whether Routemaster needs an operator role above those owners, is open.
- TODO (Mason): Whether the mirror stops at the customer-facing service sign-up, or a workspace also includes staff and owner screens.
- TODO (Mason): What [ADR 0007](../adr/0007-persistence-postgres-on-supabase.md) and [ADR 0010](../adr/0010-deployment-and-trust-boundary.md) allow. The course grades one repository and one Render deployment with a connected PostgreSQL database. ADR 0007 is one Supabase Postgres behind `DATABASE_URL` (free-plan size and pause behavior are recorded there, and instructor confirmation is still open). ADR 0010 is one Render web service, same origin, no CORS, with sessions stored in that database. Whether branded workspaces, including a custom hostname, can stay inside that single service and database is open.
