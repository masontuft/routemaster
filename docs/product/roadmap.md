# Roadmap

Post-course or optional.

- Email or text delivery of customer links. The staff pages already create and revoke links and work the Needs Review queue.
- Send customer links in bulk through Sprinkler Messenger, the companion React Native app, using a deep link that opens the app and its mass-text feature on the dispatcher's phone. Viability is not confirmed: it depends on Messenger sending a different message to each customer and on iOS and carrier limits. Spec: [docs/integrations/sprinkler-messenger.md](../integrations/sprinkler-messenger.md). Open questions: [issue 37](https://github.com/masontuft/routemaster/issues/37).
- Multi-tenant support for multiple companies.
- Import of expenses, mileage and compressor schedule tabs.
- Export to `.xlsx`, then two-way spreadsheet sync via an admin button (needs Google OAuth or a service account).
- An instructor-hosted database as an optional target for server agents.
- Referral payout model for Rocky and Skyview, once the rule is understood ([#35](https://github.com/masontuft/routemaster/issues/35)).
- Technician logins, if wanted ([#34](https://github.com/masontuft/routemaster/issues/34)).
