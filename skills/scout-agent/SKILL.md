---
name: scout-agent
description: Use when you want a scheduled agent to find improvement ideas in your code and your industry, and propose them as issues for a human to triage.
---

# Scout for improvement ideas

A scout agent finds work for builder agents. It audits the codebase, watches dependencies, and researches the industry, then proposes concrete improvements as issues. It never writes code, never opens a pull request, and never builds what it finds. The human still judges every finding and decides what becomes work. Mason confirms the schedule, the cap, the research window, the scores, and the label names before those are settled.

1. Run the scout on a schedule, for example every Monday at 9am, and also allow a manual run. One run, one focus, at most 5 findings.
2. Start the run with a scheduled job. A scheduled GitHub Action or a cron'd Claude Code job are examples. Which runner actually starts the scout is not settled.
3. Audit the codebase for that week's focus: dead code, duplicated logic, slow queries, missing tests, flaky tests, accessibility issues, and security problems such as outdated dependencies with known vulnerabilities.
4. Watch dependencies and tooling: new major versions, deprecated APIs, and breaking changes. Sort them into "safe to upgrade" and "needs a human."
5. Research the industry for the last 14 days: what similar apps are shipping, what patterns are becoming standard, and any new platform capability this app could use. For each one, say what changed, why it matters to this codebase specifically, and what the smallest useful change would be. Skip generic trends with no concrete link to the code.
6. If analytics or support data exist, check them too: the most common errors, the most-abandoned flows, and the most-asked questions. Real user signal beats a guess.
7. Score every finding 1 to 5 on impact, evidence, and effort. Only propose findings with strong evidence. Skip style-only rewrites and anything you cannot prove with a file and line, a failing test, an error log, or a link.
8. Open a normal issue labeled `scout-proposal` for each finding, with this shape:
   - Title, one line
   - Evidence: file and line, or a link to the source
   - Impact: who it affects and how much
   - Effort: S, M, or L
   - Suggested first step, not a full solution
9. The human triages those issues: keep, edit, or close. Only issues the human promotes to `agent-ready` go to builder agents, following the multi-agent-workflow skill. The scout never promotes its own findings. The two skills share that label contract.
10. Log the run in the ledger, using the ai-ledger-handoff skill, so the next agent knows what the scout found and what was kept.
11. Guard the queue and the noise. Before filing, skip the run if 8 or more `scout-proposal` issues are already open ("queue full, triage needed"). Dedupe against every issue and pull request, open or closed: a closed `scout-proposal` issue means the human rejected the idea, so never re-file it. Filing nothing is a good outcome.
12. In a public repo, never file anything an attacker could use (an exploitable weakness, an exposed secret, a vulnerable dependency with a known exploit). Withhold it from the issue and list it in the run's final report for the human to handle privately.
13. Send the day's scout activity to the daily digest: what was filed, what was skipped, and whether the queue is full, so the human sees it without opening GitHub. Step 13 of the multi-agent-workflow skill describes the digest itself.

Example finding:

```markdown
## Slow route list query in routemaster
- **Evidence:** src/routes/list.ts:42 — one query per route, 40 queries for a normal day
- **Impact:** Route list takes 2.1s to load for a dispatcher with 40 stops
- **Effort:** M
- **First step:** Batch the stop lookup into one query and measure the load time again
```

> "could there be some kind of consistent agent that consistently tries to find things that could be improved or does some research in the industry and be like, oh, well this would work better this way"

TODO (Mason): confirm the Monday 9am schedule. It is not in the source quote. Do not invent it.

TODO (Mason): confirm the cap of 5 findings. It is not in the source quote. Do not invent it.

TODO (Mason): confirm the 14-day window. It is not in the source quote. Do not invent it.

TODO (Mason): confirm the 1–5 scoring. It is not in the source quote. Do not invent it.

TODO (Mason): confirm the `scout-proposal` and `agent-ready` labels. They are not in the source quote. Do not invent them.

TODO (Mason): confirm how the scout is run. A scheduled GitHub Action and a cron'd Claude Code job are examples only. Do not invent the runner.
