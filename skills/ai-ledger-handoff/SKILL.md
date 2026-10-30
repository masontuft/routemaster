---
name: ai-ledger-handoff
description: Use when you switch between AIs or sessions often and want context to persist without re-explaining.
---

# Ledger for cross-agent context

Keep a ledger so the next agent can get back in sync without a re-explanation. It is an AI-to-AI log, not a human status report. Each agent writes its own file for each day, so agents working at the same time never edit the same file. The human can still read it and correct it.

1. Keep the ledger in the repo, in a `ledger/` folder. Name each file `<agent>_YYYY-MM-DD.md`, for example `claude_2026-10-29.md`. One file per agent per day.
2. Write for an AI reader: "I did this, this is why." After each segment of work (one coherent unit, such as a feature, a module, or a refactor), append one entry to your own file for today.
3. Every entry has four fields:
   - **Changed:** the files touched.
   - **Why:** the reason, and the request behind it.
   - **Decisions:** alternatives rejected and trade-offs taken, so the next agent does not re-argue them.
   - **Open / next:** unfinished work, known gaps, and what to do next.
4. On a new session, an agent switch, or lost context, read every file in `ledger/` from the last 3 days (all agents, newest first) before working. A time window, not a fixed file count, means a busy day cannot push context out of range. If there are no files in the last 3 days, widen the window to 7 days, then 14.
5. Tell agents about the ledger in `AGENTS.md` so they all keep it in sync. Old days can be archived once nobody needs them.

Example entry in `ledger/claude_2026-10-29.md`:

```markdown
## 14:32 — Add rate limiting to /api/login
- **Changed:** src/auth/login.ts, src/middleware/rateLimit.ts
- **Why:** Brute-force protection. Mason asked for 5 attempts per minute per IP.
- **Decisions:** In-memory counter, not Redis, because there is one instance for now.
- **Open / next:** No tests yet. The counter resets on deploy.
```

> "This is AI talking to AI. This is AI saying, I did this, this is why."
