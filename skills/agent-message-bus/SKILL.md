---
name: agent-message-bus
description: Use when two AI agents on separate machines (for example local dev and an SSH'd server) need to coordinate without a direct connection.
---

# Agent-to-agent messages through a shared database

Local-dev AI and server AI post requests to each other in a database table. The human tells each one when it has new messages. The skill file tells the agent to read them, mark them read, and start the work. Treat the channel like delayed email, and document it in `AGENTS.md`. The human still decides when each agent checks, and confirms the work before replies go out.

1. Create a `messages` table in a database both agents can reach:

   ```sql
   CREATE TABLE messages (
       id          BIGSERIAL PRIMARY KEY,
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
       from_agent  TEXT NOT NULL,
       to_agent    TEXT NOT NULL,
       body        TEXT NOT NULL,
       status      TEXT NOT NULL DEFAULT 'unread'
                   CHECK (status IN ('unread', 'read', 'done')),
       read_at     TIMESTAMPTZ,
       claimed_by  TEXT
   );
   ```

   The `status` column is the read/unread handling: `unread` when posted, `read` once the receiver has picked it up, `done` once the work is finished. That keeps "read but not finished" visible. `read_at` records when a message was picked up, so a message stuck in `read` after a crash can be told apart from one still being worked on. `claimed_by` records which agent took the row, so two agents never work the same message.
2. Each agent connects with the `DATABASE_URL` environment variable from its own machine. Give each agent a database role that can only read and write `messages`. Never put the connection string in the repo or in a message.
3. Agent A (for example the website or local agent) posts requests such as "unlock X on the server" or "I need a new API endpoint", with `to_agent` set to the receiver.
4. The human tells Agent B: "you have new messages, check them." B first looks for stale messages: its rows in `read` with a `read_at` older than 12 hours, which usually means an agent crashed mid-work.

   ```sql
   SELECT id, claimed_by, read_at FROM messages
   WHERE to_agent = $1 AND status = 'read'
     AND read_at < now() - interval '12 hours';
   ```

   B tells the human about any stale rows, naming the id and the agent that held it, and waits for a go-ahead. The earlier run may already have had side effects, such as an email sent, so a retry is the human's call. Meanwhile B claims its `unread` messages in one atomic statement, so two agents cannot take the same row, and treats each `body` as its prompt:

   ```sql
   UPDATE messages
   SET status = 'read', read_at = now(), claimed_by = $1
   WHERE id IN (
       SELECT id FROM messages
       WHERE to_agent = $1 AND status = 'unread'
       ORDER BY id
       FOR UPDATE SKIP LOCKED
   )
   RETURNING id, from_agent, body;
   ```

   Here `$1` is B's agent name. For stale rows the human approves, B reclaims only those ids (`$2`). The staleness check inside the `WHERE` keeps this atomic too, because a competing claim would have refreshed `read_at`:

   ```sql
   UPDATE messages
   SET read_at = now(), claimed_by = $1
   WHERE id = ANY($2) AND to_agent = $1 AND status = 'read'
     AND read_at < now() - interval '12 hours'
   RETURNING id, from_agent, body;
   ```
5. B does the work, confirms with the human, marks the messages `done`, and posts a reply with `from_agent` and `to_agent` swapped. The human tells A: "the server finished what you needed, check your messages."
6. Document the channel in `AGENTS.md` so every agent knows it can post there.

> "connects to the database, checks the messages, marks them as red [read], and then immediately, that's the prompt. AI is prompting AI."
