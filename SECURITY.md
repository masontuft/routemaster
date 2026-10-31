# Security Policy

## Reporting a vulnerability

Report privately. Do not open a public issue and do not post exploit details or secrets. Use GitHub's "Report a vulnerability" under this repo's Security tab (private advisories) if enabled, or email masontuft@gmail.com.

## Scope

Routemaster is a student project (CSE 340 final project). The server is not built or deployed yet. The repository holds the docs and the test-database guard. Sample data in the repo is non-production and fake.

## Secrets

Never commit secrets, `.env` files, keys, or database URLs. Only names and placeholders go in `.env.example`.

## No guarantee

This file does not guarantee the app is secure. See the [security assessment](docs/security/security-assessment.md) for what is and is not covered.
