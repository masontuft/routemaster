# Secrets and Configuration

Secrets live in environment variables only. `.env` files are never committed. `.env.example` holds names and placeholders. The test guard keeps tests off the real database. Names are in [environment variables](../setup/environment-variables.md). Secret scanning is not wired yet.
