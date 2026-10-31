-- Messages from the public contact form. replied_by SET NULL keeps the message if the staff user is deleted.
CREATE TABLE contact_messages (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Replied')),
    reply_note TEXT,
    replied_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    replied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
