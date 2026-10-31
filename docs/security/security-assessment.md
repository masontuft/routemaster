# Security Assessment

Scope: the accepted architecture. No code exists, so there are no verified findings. Everything below is planned design or recommended hardening, not a confirmed defect.

## Data classification

Planned, not built: customer names, phones, addresses and payment records (personal); password hashes; session data. Mason's real spreadsheet holds real customer data and must never be committed.

## Planned controls (Not currently implemented)

| Area | Plan |
| --- | --- |
| Authentication | bcrypt hashes, `express-session`, Postgres store ([ADR 0010](../adr/0010-deployment-and-trust-boundary.md)) |
| Access control | Role checks in middleware on every protected route |
| Injection | Parameterized queries only |
| Input | Server-side validation and sanitization; EJS `<%=` escaping |
| Import | Google Sheets URLs only, strict ID pattern, fixed host path, size-limited `.xlsx` uploads ([ADR 0009](../adr/0009-spreadsheet-import-and-sync.md)) |
| Cookies | HttpOnly, Secure in production, SameSite=lax |

## Open

CSRF protection is not yet researched. Dependency audit and secret scanning are not wired.

## Findings

None verified.
