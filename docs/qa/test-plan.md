# Test Plan

Planned areas, each needing a test file when built. The test-database guard has tests. The areas below do not.

- Authentication: register, login, logout, wrong password, session cookie flags.
- Authorization: each role against each protected route, including a denied case.
- Validation: empty, malformed and oversized input on every form.
- Request workflow: each status transition and its `status_history` row.
- Routes: assigning and ordering stops.
- Import: tab picker, mapping, preview, confirm, bad link, wrong file type, oversized file.
- Error handler: a thrown error renders the error page, not a stack trace.
