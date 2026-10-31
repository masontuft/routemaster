# Rollback Runbook

Render's rollback commands are not verified. Cautious approach: redeploy the last known good commit. Migrations are forward-fix only ([ADR 0008](../adr/0008-schema-as-numbered-sql-migrations.md)), so rolling back code after a migration can break against the newer schema; write a new migration instead of editing an applied one. Supabase restore is a last resort.
