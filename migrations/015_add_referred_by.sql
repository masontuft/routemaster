-- Who referred the job, such as Rocky or Skyview. Payouts are handled outside the app, so this column
-- stores a name only. Empty means nobody was recorded.
ALTER TABLE service_requests ADD COLUMN referred_by TEXT;
