-- A Messenger batch that staff stage again (src/models/messengerBatch.js stageAgain) is a new batch for the people the
-- first one left unsent. restaged_from names that first batch, so a batch can be staged again only once: UNIQUE refuses
-- a second batch for the same source, while the many NULLs of ordinary batches stay allowed. A double click, a refresh
-- of the page that posted, or a second tab therefore cannot make two batches. Staging again from the new batch is
-- still possible, because its own id is a different source. SET NULL keeps a batch whose source was deleted.
ALTER TABLE messenger_batches
    ADD COLUMN restaged_from INTEGER UNIQUE REFERENCES messenger_batches (id) ON DELETE SET NULL;
