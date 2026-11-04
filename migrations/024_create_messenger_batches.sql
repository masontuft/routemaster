-- A batch of customers staged for Sprinkler Messenger to text (docs/integrations/sprinkler-messenger.md, ADR 0015).
-- The batch token in the deep link is never stored, only its hash, as for a magic link. It has two clocks: the batch
-- can be fetched until fetch_expires_at, and results can be posted until results_expires_at, because texting a few
-- hundred customers with a tap each takes longer than the fetch window.
-- SET NULL keeps the batch if the user who staged it is deleted.
CREATE TABLE messenger_batches (
    id SERIAL PRIMARY KEY,
    created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    message_template TEXT NOT NULL CHECK (char_length(message_template) BETWEEN 1 AND 500),
    link_days INTEGER NOT NULL CHECK (link_days BETWEEN 1 AND 120),
    fetch_expires_at TIMESTAMPTZ NOT NULL,
    results_expires_at TIMESTAMPTZ NOT NULL,
    fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per customer in a batch, and the record of whether they were texted. "sent" means the phone's messaging
-- app took the message, not that the customer got it. access_link_id is the magic link the latest fetch minted for
-- this customer, so the next fetch can revoke it. Deleting a customer removes their row.
CREATE TABLE messenger_batch_recipients (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER NOT NULL REFERENCES messenger_batches (id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    access_link_id INTEGER REFERENCES access_links (id) ON DELETE SET NULL,
    sent_at TIMESTAMPTZ,
    error TEXT CHECK (char_length(error) <= 200),
    UNIQUE (batch_id, customer_id)
);
