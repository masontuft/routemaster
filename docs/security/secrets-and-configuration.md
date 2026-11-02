# Secrets and Configuration

Secrets live in environment variables only. `.env` files are never committed. `.env.example` holds names and placeholders. The test guard keeps tests off the real database by comparing host, port, and database name, not only the raw connection string. Names are in [environment variables](../setup/environment-variables.md). Secret scanning is not wired yet ([#26](https://github.com/masontuft/routemaster/issues/26)).
