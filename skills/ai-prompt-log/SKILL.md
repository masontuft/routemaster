---
name: ai-prompt-log
description: Use when you need a record of AI assistance, for course requirements or decision history.
---

# Prompt log

Record every prompt and the model used. This is not fully automatic. It sometimes needs a reminder at the end of a session. The human reads the log and decides what it is used for.

1. Keep one file per day in a `prompts/` folder: `prompts/YYYY-MM-DD.md`.
2. At session start, tell the agent to get acclimated, read the project, and do a full sweep, then: "I need you to write every single prompt and the model and follow the structure of the markdown file here." Point it at the template below.
3. Tell the agent to save this rule to its memory file.
4. For each prompt, append an entry with the time, the model, the prompt word for word, and a one-line outcome.
5. At the end of a session, remind it: "store those prompts." No hook or other automation records prompts, so keep this reminder.

Template for `prompts/YYYY-MM-DD.md`:

```markdown
# AI prompt log — 2026-10-29

## 14:32 — claude-sonnet-5-5
**Prompt:** Add rate limiting to /api/login.
**Outcome:** Added middleware; no tests yet.

## 15:05 — claude-sonnet-5-5
**Prompt:** Write tests for the rate limiter.
**Outcome:** Five tests added, all passing.
```

> "hey, every single prompt I send in, I want you recording it and the model."
>
> "I need you to do this and write it to your memory file… write every single prompt and follow the structure of the markdown file here."
