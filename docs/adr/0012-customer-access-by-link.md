# ADR 0012: Customer Access by Link

## Status

Accepted

## Date

2026-10-31

## Context

The company has thousands of customers and will message each one a link to schedule an appointment. Asking every customer to register and remember a password is impractical. The course still requires session authentication, a standard user role, user content tied to an account, and one test account per role that graders log in to with a password.

## Decision drivers

- Customers must be able to schedule without registering.
- A link must not let anyone act as another customer.
- Graders need a customer account with a password.
- Existing imported customers have no login.

## Decision

- **Magic link.** A link holds a 32-byte random token. The database stores only its SHA-256 hash in `access_links`, tied to one customer, with an expiry and an optional revoke time. Opening the link (GET) shows a Continue button and changes nothing, because email scanners open links. The button POSTs to redeem it. Redeeming creates or reuses a user row with no email and no password (`role = customer`), regenerates the session, and starts a normal session. The token stays valid until it expires (30 days by default) or is revoked.
- **Generic link.** One public `/schedule` page asks for name, phone and street address. They are normalized and matched to a customer only when all three match. The visitor is not logged in and sees the same pages whether or not a match was found. The only thing they can do is submit a preferred date. A match creates a Requested request for that customer. No match creates a Needs Review request that stores the typed details and no customer, for a dispatcher to review.
- **Passwords stay.** Registration and login from ADR 0010 remain. The seeded `customer@example.com` is the account for graders. Owner and dispatcher use passwords only.
- **Throttling.** POST routes for login, link redemption and the generic link are limited per IP (20 per 15 minutes) with `express-rate-limit` 8.7.2, using its default in-memory store. Over the limit, the request goes to the global error handler as a 429.

## Alternatives considered

- Internal database IDs in the URL. Rejected: anyone could edit the ID and act as another customer.
- Letting a generic-link match log the visitor in. Rejected: name, phone and address are semi-public, so a match would not prove identity.
- Links only for customers, with no password account. Rejected for now because graders log in with a password. It can be revisited if the instructor confirms it is acceptable.
- A hand-written limiter. Written first, then replaced by `express-rate-limit` once Mason approved the dependency.

## Consequences

- `users.email` and `users.password_hash` are nullable. A check keeps a password hash from existing without an email, and login refuses a user with no hash.
- Anyone with a magic link can act as that customer until it expires, as with any bearer link. Forwarded emails are a residual risk.
- A generic link can be used to submit spam requests. The limiter and Needs Review status contain it; there is no CAPTCHA.
- The limiter's counts live in memory (the package's default store), so they reset on restart and are per instance. A shared store would be needed for several instances.
- Matching is exact after normalization (case, punctuation, common street words, phone digits). Typos and nicknames will not match and will go to Needs Review.
- No screen creates or sends links yet. `pnpm link:create` prints one for testing. A dispatcher screen for generating, revoking and sending links is Not currently implemented.
- Verified locally only.
