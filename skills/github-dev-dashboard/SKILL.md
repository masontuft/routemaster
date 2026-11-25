---
name: github-dev-dashboard
description: Use when you want a public developer page that shows a project's pull requests, their progress, and its issues, powered by the GitHub API.
---

# GitHub developer dashboard

Build a public developer page for a website or mobile app that shows real pull requests, their progress, and issues. The token never goes in the website or the app. The frontend calls your own backend, and only the backend calls GitHub with the token. The human still decides what is public, and reviews the page before it ships. Mason confirms the token expiry, the cache window, and the per-IP limit before those are settled.

1. Create a fine-grained personal access token, read-only, scoped to only the repository the page is about, with an expiry (90 days is a good start). Give it Contents: Read, Pull requests: Read, Issues: Read, and Checks: Read. Checks: Read covers the check-runs API and `statusCheckRollup`. Store it as an environment variable on the backend, never in git and never in frontend or mobile code. Move to a GitHub App later for a token that auto-rotates.
2. Build a tiny backend proxy that exposes only what the page needs, for example `GET /api/github/pulls?state=all`, `GET /api/github/issues?state=all`, `GET /api/github/pulls/:number`, and `GET /api/github/stats`. The same backend works for a website, a React Native app, or both.
3. Call the GitHub REST API from the backend: `GET /repos/{owner}/{repo}/pulls?state=all&sort=updated` for pull requests, `GET /repos/{owner}/{repo}/pulls/{number}` for one PR, `GET /repos/{owner}/{repo}/pulls/{number}/reviews` for reviews, `GET /repos/{owner}/{repo}/issues?state=all` for issues, and `GET /repos/{owner}/{repo}/commits/{sha}/check-runs` for CI status. Send `Authorization: Bearer <token>` and `Accept: application/vnd.github+json`.
4. Filter the issues response: it returns pull requests too, so drop any item that has a `pull_request` field if you only want real issues. A PR is also an issue in GitHub's data model, so the counts overlap — that is normal.
5. Show PR progress by combining `state` (open or closed), `draft` (true means work in progress), `merged_at` (set means merged, not just closed), review state (approved, changes requested, or pending), and check runs (passing, failing, or pending). Use the PR head SHA for checks, not another commit.
6. Return only the fields the cards render: `number`, `title`, `user.login`, `state`, `draft`, `merged_at`, `labels`, `created_at`, `updated_at`, `html_url`, review state, check status, and issue comment count. Trim `body` to a short excerpt; do not forward raw GitHub responses.
7. Cache the backend response for 5 to 10 minutes, in memory, Redis, or a JSON file. Every visitor hits the cache, not GitHub, because the authenticated rate limit is 5,000 requests per hour and the unauthenticated limit is 60. Reuse the `ETag` GitHub returns by sending it back as `If-None-Match`; a `304 Not Modified` response does not count the same way against the limit.
8. Render a PR card with title and number linked to `html_url`, author, a status badge (Open, Draft, Merged, or Closed), labels, review status, check status, and a relative updated date. Render an issue card with title and number, author, labels, state, comment count, and created date. Add a stats strip on top: open PRs, merged this month, open issues, and the last-updated time.
9. For React Native, use the same fetch calls with a `FlatList` for the cards and pull-to-refresh to re-fetch. Build mobile-first, following the ui-design-mobile skill.
10. Poll every 5 to 10 minutes for live updates. For faster updates, add a GitHub webhook on `pull_request` and `issues` events that clears the cache, and verify the webhook signature with the secret you set.
11. Use GraphQL only when the page gets slow or makes too many calls. One query to `https://api.github.com/graphql` can fetch pull requests with labels, reviews, and the latest commit's `statusCheckRollup` in a single request, with the same `Authorization: Bearer` header. Start with REST.
12. Before shipping, check: the token is in an environment variable, fine-grained, read-only, scoped to one repo, and has an expiry with a rotation reminder; the API has its own rate limit (for example 60 requests per minute per IP); and if the repo is private, decide what is public — the API is now the gate, so do not expose issue bodies, internal labels, or author emails you do not want public.

Example PR card:

```markdown
## #42 Add offline route caching — Open, Draft
- **Author:** masontuft · **Updated:** 2h ago
- **Reviews:** Awaiting review · **Checks:** Passing
- **Labels:** enhancement
- **Link:** https://github.com/masontuft/routemaster/pull/42
```

> "he also has a developer page that shows all of his pull requests and their progress and the issues"

TODO (Mason): confirm the 90-day token expiry. It is not in the source quote. Do not invent it.

TODO (Mason): confirm the 5–10 minute cache and the 5–10 minute poll. They are not in the source quote. Do not invent them.

TODO (Mason): confirm the 60 requests-per-minute per-IP limit on the page's own API. It is not in the source quote. Do not invent it.
