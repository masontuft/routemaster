# Roadmap

Work is grouped by how close it is, not by date. Nothing here has a deadline, and nothing outside "Built recently" is a commitment.

- **Now:** being built, or the next thing to pick up.
- **Next:** wanted, not started.
- **Later:** optional, or waiting on a decision or on another app.

Routemaster is a partner app to Sprinkler Messenger. Messenger sends the texts, from the owner's own phone, and Routemaster holds the customers, links and requests. Items below that touch sending are placed with that in mind.

## Built recently

"Built" means merged into the main branch. Leads and the person name rules have ADRs that stay Proposed until they are checked on the live database, so they are built but not yet proven in use.

- Leads for visitors who match no customer ([ADR 0017](../adr/0017-leads-for-unmatched-visitors.md)): one lead per person, converted when staff match them, deleted with their customer.
- Rebooking last season's customers ([ADR 0014](../adr/0014-rebooking-and-tentative-bookings.md)): a list of customers served in an earlier year who have not booked this year, links for just those customers (for one area or all areas), and, as an owner option, booking unconfirmed customers as tentative. See [the process doc](../process/customer-lifecycle.md).
- Person name rules ([ADR 0016](../adr/0016-person-name-rules.md)): joint names are handled automatically; a "last, first" order, a business, a rental or a one-word name are flagged for staff at import.
- Sending customer links in bulk through Sprinkler Messenger ([ADR 0015](../adr/0015-messenger-handoff-api.md), [spec](../integrations/sprinkler-messenger.md)): staff stage a batch in Routemaster, the Messenger app opens the link, shows the count and an editable message, and texts one customer at a time (the dispatcher taps Send for each, an iOS rule), then reports who was texted back. Routemaster is the record of who was texted. Shipped and tested in production (Mason, 2026-11-18).
- Bulk customer links by area, and import from a public Google Sheet link ([ADR 0009](../adr/0009-spreadsheet-import-and-sync.md)).

## Now

- More variables for the Messenger message. Built: the dispatcher can edit the wording on the batch screen, with `{name}` and `{link}` filled in for each customer. Next: more placeholders, such as first name only, street address, area, the booking deadline and the company's name and phone number, with a small picker so a dispatcher does not have to remember the spelling. Routemaster fills them in, because it holds the customer data, so Messenger would receive each recipient's values next to `template` and `link` and rebuild the text on the phone. A placeholder with no value for a customer (no street address, say) needs a rule: leave a visible gap to fix, or fall back to a default. Unknown placeholders already stay as typed.

## Next

- Forgot password. Changing your own password is built (`/account/password`), but a forgotten one has no way back: nothing sends email, so Mason resets it by hand. Wanted before a second company's owner depends on a password. Not started.
- Record that a customer replied by phone. The app records that a link was made, not that the customer answered a call or text.
- Property type: mark each property as a residence, a rental or a second home. A customer with several properties usually lives at one and is the landlord of the rest. Today the customer's first property (the lowest id) decides which area owns them when links are made for all areas, and that is only a stand-in for "the residence". A type would let the app pick the residence, and let rebooking tell a homeowner from a landlord. Open question: how it is captured, since the import sheet has no such column.
- Service frequency per company: the rebooking list treats a customer served earlier this year as booked, which suits a once-a-year service. A company that serves twice a year would need a setting for how many visits a year, so the list shows who is due for another.
- Season definition setting: a season is a calendar year today. A setting would let a company define it, for example a winter season that spans New Year, so a season's requests and the rebooking list group correctly.
- Messenger follow-ups, tracked in Messenger's own roadmap: keeping the dispatcher's edited message if the app is killed mid-batch, and trying it on Android. Opt-out and consent stay under Later.
- Customer review of unusual names. Planned, not a commitment, and it comes after the name rules (a "last, first" order, a business, a rental or a one-word name are flagged for staff at import; a joint name such as "Sam & Ruth Example" is handled automatically). On the customer's link page, a customer would confirm how their name is written or suggest a correction. Confirming goes straight through. A correction waits for staff approval, because a link is a bearer token and anyone it is forwarded to could otherwise rename the customer. It also fixes the greeting in Messenger texts, since `{name}` comes from the customer's name. Needs a column that remembers each customer's review state. Staff review at import stays, because many customers never open their link. Today customers cannot edit their own details and the name is owner-only, so this changes who may do a step and updates the [process doc](../process/customer-lifecycle.md). TODO (Mason): whether a customer can also set a first name for greetings, and how long a suggestion may wait for approval.
- Spam control on public forms. Planned, not a commitment. See [Spam Control](#spam-control).

## Later

- Email delivery of customer links from the app itself. Texting goes through Sprinkler Messenger (built). The staff pages already create and revoke links and work the Needs Review queue.
- Universal links and App Links for Messenger on `https://routemaster-8w24.onrender.com/m/<token>`, with a web page when the app is not installed. Needs `apple-app-site-association` and `assetlinks.json` on the Routemaster host and a new Messenger native build.
- Fix a flagged name in the import preview. Option, not a commitment. Today a flagged row is skipped, the preview lists its row number and reason, and the owner fixes the cell in the Google Sheet and runs the import again (safe to repeat, since jobs already on file are skipped). Fixing in the preview would let the owner type the right name there instead. The catch: a sheet row has no stable id ([ADR 0009](../adr/0009-spreadsheet-import-and-sync.md)), and each import step downloads the sheet again and carries only the sheet id, so a fix keyed by row number breaks when someone inserts a row, and the sheet stays unchanged so the next import flags the row again. It needs a saved list of fixes, matched to rows some other way (for example by the row's name, phone and street), that the plan hash also covers. Worth building only if the owner finds switching between the sheet and the app too slow. TODO (Mason): how a fix is matched to its row, and whether it should also be written back to the sheet.
- Import of expenses, mileage and compressor schedule tabs.
- Export to `.xlsx`, then two-way spreadsheet sync via an admin button (needs Google OAuth or a service account).
- An instructor-hosted database as an optional target for server agents.
- Technician logins. Planned, not a commitment. See [Technician Logins](#technician-logins).
- Branded business workspaces (multi-tenant). Started: each company's data is kept apart and Mason can make a company with `pnpm company:create`. The public pages with an address for each company are built (`/w/<slug>`). Branding, a sign-up for businesses, plans and an operator role are planned, not a commitment. See [Branded Business Workspaces](#branded-business-workspaces).
- Opt-out and consent for texted links. Not built, and not needed today: this web app is a partner to Sprinkler Messenger, and owners text from their own business phones, so a shared company number is not planned. If that changes, do this first, since consent and opt-out rules vary by country and state. Not legal advice.

## Branded Business Workspaces

**Status:** Started. The data of separate companies is built and kept apart (the companies work of [ADR 0018](../adr/0018-companies-and-company-scoped-data.md)), Mason can make a company with its owner and services by running `pnpm company:create`, and each company has its own public pages at `/w/<slug>` that show its name, services and reviews. Not built yet: branding (a logo, colors and copy of its own), a way for a business to sign itself up, plans and pricing, and an operator role. This page does not change the single-company decision in [ADR 0001](../adr/0001-app-type-and-repo-shape.md), which ADR 0018 amends.

A business signs up with Routemaster and is allocated its own workspace. That workspace includes a mirrored copy of the customer-facing service sign-up, branded for that business. A way for each business to customize that branding is part of the same plan.

The flow being mirrored is the public service sign-up a customer uses today: the generic `/schedule` page in [ADR 0012](../adr/0012-customer-access-by-link.md), where a visitor enters a name, phone, and street and submits a preferred date.

**User value.** Another service company can take requests under its own name. Its customers see that company's branding. Its workspace is its own, so its customers and requests are not mixed with another business's.

**Rough scope.**

- Business sign-up that allocates a workspace.
- A per-business workspace with data isolated from other businesses.
- A branded mirror of the customer-facing service sign-up.
- A customization layer for that branding. Examples only, until the open questions below are answered: logo, colors, copy, and possibly a subdomain or a path.

**Open questions.**

- Decided (Mason, 2026-11-18): how tenants are isolated. Rows in shared tables, each tagged with a company (`companies` table, `company_id` column), in the one database. See [ADR 0018](../adr/0018-companies-and-company-scoped-data.md). Only the first step is built: migration 028 adds the table and the columns, and nothing reads them yet. A schema per business and a database per business were rejected. ADR 0001 rejected a tenant column on day one because it would touch every table and query, and the later steps are that work.
- Decided (Mason, 2026-11-19): the URL scheme is a path, `/w/<slug>`, because it works in the one Render service without wildcard DNS. Built: a company home page, schedule, services, reviews, contact, register and login at that address. A subdomain or a custom hostname is not built.
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
