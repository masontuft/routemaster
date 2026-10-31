-- Customers who arrive by link get a user row with no email and no password.
-- A password hash still requires an email, so a password login always has something to look up.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_password_requires_email CHECK (password_hash IS NULL OR email IS NOT NULL);
