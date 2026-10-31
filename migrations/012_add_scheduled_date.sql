-- preferred_date is what the customer asked for. scheduled_date is the day staff booked, set when a request
-- moves to Scheduled. It stays after Completed or Cancelled so the history of what was booked is kept.
ALTER TABLE service_requests ADD COLUMN scheduled_date DATE;
