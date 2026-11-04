# ADR 0015: Messenger Handoff API

## Status

Proposed. Mason answered the domain, source-of-truth, consent and build-order questions on 2026-11-04. It stays Proposed until the two endpoints are built and the Messenger app has fetched a real batch from them.

## Date

2026-11-04

## Context

Staff already make a batch of per-customer scheduling links and copy them out by hand (`/staff/link-batches/new`, `/staff/rebooking`). Sprinkler Messenger, the companion React Native app on the dispatcher's own phone, has a mass-text feature. The goal is a deep link that opens Messenger with one batch ready to send. See [the spec](../integrations/sprinkler-messenger.md).

Routemaster has no JSON API (`docs/api/endpoints.md`), and its POST routes are protected by session cookies and CSRF tokens (ADR 0010). A mobile app cannot use either. Raw magic-link tokens are not stored, only their hashes (ADR 0012), so a link can only be shown at the moment it is made.

Mason's answers on 2026-11-04:

- The public host is `https://routemaster-8w24.onrender.com`.
- Routemaster is the source of truth for who was texted, because the Google Sheet is being phased out.
- Opt-out and consent handling is a roadmap item, not part of this work. Owners text from their own business phones today.
- Build Routemaster first (the endpoints and tables), test it with `curl`, then change Messenger.

## Decision drivers

- No customer name, phone number or magic link in a URL, a log or a push payload.
- A link that is forwarded, or claimed by another app that registers the same custom scheme, must not hand over a batch twice.
- Sending still needs a tap per message on iOS, so a batch takes longer than an hour to send.
- Keep the change small: two endpoints, two tables, no new login system.

## Decision

- **A batch is staged in Routemaster.** Staff stage a batch from the link-batch or rebooking page. Staging stores the chosen customers and the message template in `messenger_batches` and `messenger_batch_recipients`. No magic link is made yet, so a batch nobody opens leaves no live link behind.
- **The deep link carries one batch token.** 32 random bytes, base64url, hash only in the database. The link is `sprinklermessenger://batch/<token>` first, and `https://routemaster-8w24.onrender.com/m/<token>` once universal links are set up.
- **Two token-authenticated JSON endpoints.** `GET /api/messenger/batches/:token` and `POST /api/messenger/batches/:token/results`. They skip the session and CSRF, answer with `Cache-Control: no-store`, and have their own rate limit. The batch token is the only credential. This ends the "no JSON API" stance for these two routes only.
- **Fetching mints the links.** A fetch makes one magic link per recipient who is not yet marked sent, and revokes any link an earlier fetch of the same batch made for that recipient. A dropped connection after a fetch is then recoverable by fetching again, and nobody already marked sent is texted twice. This changes the spec's earlier recommendation of a `409` on the second fetch.
- **Two time limits.** Fetching works for 1 hour after staging. Results can be posted for 24 hours after staging, because sending a few hundred texts with a tap each takes longer than an hour. Both answer `404` after, the same as an unknown token.
- **Routemaster records who was texted.** `messenger_batch_recipients.status` is `pending`, `sent`, `failed` or `skipped`. "Sent" means the phone's messaging app took the message, not that the customer received it. Messenger's own Google Sheet "texted" column stops being the record.
- **Consent and opt-out are not built.** They go on the roadmap.

## Alternatives considered

- **Phones, names and links in the deep link.** Rejected: they would sit in message history, logs and any other app that claims the scheme.
- **Write the batch to the shared Google Sheet.** Rejected: that sheet is readable with a public API key, and it is being phased out.
- **A `409` on the second fetch.** Rejected for now: a dropped connection would strand a batch whose raw links can never be shown again.
- **One long expiry.** Rejected: a bearer secret good for 24 hours to fetch is a bigger window than needed.
- **A staff login inside Messenger.** Rejected: a second login system for one screen. The single-use-style batch token is enough while batches are short-lived.
- **Universal links first.** Deferred: they need Messenger to ship a native build with the associated domain. The custom scheme works with a dev build.

## Consequences

- Routemaster gains two public JSON routes. They need tests for an unknown, expired and re-fetched token, a partial results post, and a rate limit.
- `docs/api/endpoints.md`, the threat model and the security assessment must change in the same pull request as the endpoints.
- A new migration adds two tables. A hosted database needs `pnpm migrate` before deploy.
- Messenger must add a `batch/[token]` route, a confirmation screen and per-recipient message bodies. That work is later and separate.
- Anyone who gets the deep link within the window can fetch the batch, so sending it to the dispatcher's own device is safer than email.
- Texted links keep the 30-day default from ADR 0012. A shorter expiry is an open question in the spec.

## References

- [Spec](../integrations/sprinkler-messenger.md)
- [ADR 0010](0010-deployment-and-trust-boundary.md), [ADR 0012](0012-customer-access-by-link.md) and [ADR 0014](0014-rebooking-and-tentative-bookings.md)
- [Issue 37](https://github.com/masontuft/routemaster/issues/37)
