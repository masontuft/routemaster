---
name: multi-agent-workflow
description: Use when you want many Claude Code agents working in parallel on labelled GitHub issues, each opening a draft pull request for a human to review.
---

# Multi-agent workflow

One coordinator, many builder agents, and a human gate. A labelled issue triggers one headless Claude Code run in its own isolated branch and workspace. The agent builds the fix, runs the tests, and opens a draft pull request. A separate reviewer checks it, and the human still decides what ships. The point is throughput on small, well-defined tasks, not 15 times a good developer. Mason confirms the label names, the agent counts, and the `claude -p` flags before those are settled.

1. Set the roles before you scale: a coordinator (or orchestrator) watches the issue queue and spawns agents, a builder agent works one issue, a reviewer agent checks the builder's draft pull request, and the human reviews and merges. No agent merges, deploys, or touches `main`.
2. Trigger a builder only from a labelled issue. A GitHub Action may listen for `issues: opened` and `issues: labeled`, and its `if` must require the `agent-ready` label, using `github.event.label.name` or the issue's labels. A typo report must not spawn an agent. If both events fire for one issue, the coordinator still assigns one builder.
3. Give each builder one isolated workspace: its own git worktree and its own branch, for example `agent/issue-42`, or its own container or runner. Two agents never share a branch, a worktree, or an issue.
4. Run the builder headless with a tight prompt, for example `claude -p` with the issue title and body, the repo's test command, and these rules: implement the smallest fix, run the relevant tests, commit, push the isolated branch, open a draft pull request, do not merge, do not push to `main`, and do not change unrelated files. Include `Bash(gh:*)` (or an equivalent that can run `gh`) in `--allowedTools` so the run can push and open the pull request.
5. The builder pushes its isolated branch and opens a draft pull request with `gh pr create --draft`, with a summary of what changed, why, and how to test it, plus the test results. Draft means CI still runs and the pull request is marked not ready. A ruleset or branch protection is what blocks the merge.
6. Run a separate reviewer agent on the draft pull request. It reads the diff against the issue, runs the tests and linter, and posts a review: approve, request changes, or "needs a human decision." The builder never reviews its own work.
7. The human reads the diff, the CI results, and the review, then marks the draft ready for review or asks for changes. Another builder run starts from `pull_request_review` (a submitted review) or from `issue_comment` on that draft pull request. On `issue_comment`, the payload has no head ref, so continue only when the pull request is the draft on the isolated agent branch. The builder picks up that feedback and iterates.
8. Scale with a queue, not by starting at 15. Start with 1 agent, then 3 to 5, then more. The coordinator picks the next labelled issues, caps concurrency, assigns issues by area (frontend, backend, docs) so two agents do not touch the same files, and tracks which agent is on which issue. Give each agent a max-turns and max-cost budget and a kill switch.
9. Feed the queue with the scout agent, using the scout-agent skill. The scout runs on a schedule, files findings as normal issues labelled `scout-proposal`, and the human triages them. Only issues the human promotes to `agent-ready` go to builders. The scout never builds, and builders never pick up unlabelled issues. The two skills share that label contract.
10. Watch the work on a developer page, using the github-dev-dashboard skill, so the page shows agent, issue, branch, draft pull request, and CI status in one place. The token stays on the backend.
11. Log each run in the ledger, using the ai-ledger-handoff skill, so the next agent knows what changed and what is still open.
12. For a scheduled autofix run, cap the output and pause when review is behind. Open at most 2 draft pull requests per run, in different repos where possible. Before starting, count the open draft pull requests on the agent's branches across the repos: at 5 or more, stop and open nothing; at 4, open at most 1. When an agent skips an issue it leaves a `claude-skipped` comment with the reason, and that comment blocks the issue for 14 days only, so a skipped issue becomes eligible again.
13. Run a daily digest so the human does not have to hunt through GitHub. A read-only scheduled job runs after the scouts and autofix, writes a short file (new scout issues, draft pull requests to review, autofix skips with reasons, the queue count, and whether each scheduled task ran), and sends one notification only when something needs the human, such as new issues to triage, drafts to review, a full queue, a paused autofix, or a task that did not run.

Example trigger and builder run:

```yaml
# .github/workflows/agent.yml
on:
  issues:
    types: [opened, labeled]
  pull_request_review:
    types: [submitted]
  issue_comment:
    types: [created]
jobs:
  build:
    # On issue_comment, the payload has no head ref. Continue only when
    # the pull request is the draft on the isolated agent branch.
    if: |
      (github.event_name == 'issues' && github.event.action == 'labeled' && github.event.label.name == 'agent-ready') ||
      (github.event_name == 'issues' && github.event.action == 'opened' && contains(github.event.issue.labels.*.name, 'agent-ready')) ||
      (github.event_name == 'pull_request_review' && github.event.pull_request.draft == true && startsWith(github.event.pull_request.head.ref, 'agent/')) ||
      (github.event_name == 'issue_comment' && github.event.issue.pull_request)
    runs-on: ubuntu-latest
```

```bash
claude -p --allowedTools "Bash,Read,Edit,Write,Glob,Grep,Bash(gh:*)" \
  "Fix GitHub issue #42. Read the issue, reproduce it if possible, \
   implement the smallest fix, run the relevant tests, and commit. \
   Push this isolated branch and open a draft pull request with \
   gh pr create --draft. Do not merge. Do not push to main."
```

> "an issue opens and it starts building a solution, and then opens a draft PR for you to review"

TODO (Mason): confirm the label names `agent-ready` and `scout-proposal`. They are not in the source quote. Do not invent them.

TODO (Mason): confirm the agent counts (start at 1, then 3 to 5, and the comparison with 15). They are not in the source quote. Do not invent them.

TODO (Mason): confirm the `claude -p` flags, including `--allowedTools` and `Bash(gh:*)`. They are not in the source quote. Do not invent them.
