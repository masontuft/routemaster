# Roadmap

Post-course or optional.

- Email or text delivery of customer links. The staff pages already create and revoke links and work the Needs Review queue.
- Send customer links in bulk through Sprinkler Messenger. In progress, Routemaster side first (decided 2026-11-04, [ADR 0015](../adr/0015-messenger-handoff-api.md)). A manual version exists: `/staff/link-batches/new` makes the links for an area and lists them to copy, and nothing is sent. The plan is two token-authenticated endpoints in Routemaster, tested with `curl`, then a `batch` route in Messenger. Routemaster becomes the record of who was texted. Viability still depends on Messenger sending a different message to each customer (it cannot yet) and on iOS and carrier limits. Spec: [docs/integrations/sprinkler-messenger.md](../integrations/sprinkler-messenger.md) ([issue 37](https://github.com/masontuft/routemaster/issues/37)).
- Opt-out and consent for texted links. Not built, and not needed today because owners text from their own business phones. Revisit before any shared or company-owned sending number is used, since consent and opt-out rules vary by country and state. Not legal advice.
- Universal links and App Links for Messenger on `https://routemaster-8w24.onrender.com/m/<token>`, with a web page when the app is not installed. Needs `apple-app-site-association` and `assetlinks.json` on the Routemaster host and a new Messenger native build.
- Rebooking last season's customers is built: a list of customers who were served in an earlier year and have not booked this year, links for just those customers (for one area or all areas), and, as an owner option, booking unconfirmed customers as tentative. See [the process doc](../process/customer-lifecycle.md). Still open: recording that a customer replied by phone, sending the links, and the two entries below.
- Service frequency per company: the rebooking list treats a customer served earlier this year as booked, which suits a once-a-year service. A company that serves twice a year would need a setting for how many visits a year, so the list shows who is due for another.
- Season definition setting: a season is a calendar year today. A setting would let a company define it, for example a winter season that spans New Year, so a season's requests and the rebooking list group correctly.
- Property type: mark each property as a residence, a rental or a second home. A customer with several properties usually lives at one and is the landlord of the rest. Today the customer's first property (the lowest id) decides which area owns them when links are made for all areas, and that is only a stand-in for "the residence". A type would let the app pick the residence, and let rebooking tell a homeowner from a landlord. Open question: how it is captured, since the import sheet has no such column.
- Branded business workspaces (multi-tenant). Planned, not a commitment. See [Branded Business Workspaces](#branded-business-workspaces).
- Import of expenses, mileage and compressor schedule tabs.
- Export to `.xlsx`, then two-way spreadsheet sync via an admin button (needs Google OAuth or a service account).
- An instructor-hosted database as an optional target for server agents.
- Technician logins. Planned, not a commitment. See [Technician Logins](#technician-logins).
- Spam control on public forms. Planned, not a commitment. See [Spam Control](#spam-control).

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
- TODO (Mason): What [ADR 0007](../adr/0007-persistence-postgres-on-supabase.md) and [ADR 0010](../adr/0010-deployment-and-trust-boundary.md) allow. The course grades one repository and one Render deployment with a connected PostgreSQL database. ADR 0007 is one Supabase Postgres behind `DATABASE_URL` (free-plan size and pause behavior are recorded there, and the instructor confirmed on 2026-11-02 that this satisfies the course). ADR 0010 is one Render web service, same origin, no CORS, with sessions stored in that database. Whether branded workspaces, including a custom hostname, can stay inside that single service and database is open.

## Technician Logins

**Status:** Planned. Future work, and not a commitment. Not currently implemented. This page does not change the decision in [ADR 0001](../adr/0001-app-type-and-repo-shape.md) and [ADR 0008](../adr/0008-schema-as-numbered-sql-migrations.md): technicians do not get their own logins for now. The dispatcher manages their routes.

A later technician role would let a technician see their own route and mark jobs done. The owner, dispatcher, and customer roles stay as they are until that work is built.

## Spam Control

**Status:** Planned. Future work, and not a commitment. Not currently implemented.

Spam protection is not being built now. The public forms in scope are reviews, contact, and the generic sign-up (`/schedule`).

The planned approach is three layers on those forms:

- A hidden honeypot field.
- Per-IP rate limiting. An in-memory limiter already covers login, magic-link redemption, `/schedule`, and contact. It is per instance and resets on restart. Reviews are not rate limited.
- Cloudflare Turnstile. Mason would create the Turnstile account and keys.

Login and magic-link redemption stay on the current limiter. This item does not add them to the three public forms.
