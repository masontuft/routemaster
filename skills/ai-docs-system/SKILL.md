---
name: ai-docs-system
description: Use when you want AI to produce and maintain full project documentation, for example for handoff, a reviewer, or a portfolio.
---

# AI-maintained project docs

Have AI write and keep the docs. The developer reviews them. The goal is that someone can take the handoff docs, plug in AI, and it already knows the project.

When a conversation produces something worth keeping, say: "Write it down for me, update it for me."

Keep a `docs/` folder. The layout below is a sample. The ADR subjects are examples of what that project recorded, not a required stack.

- ADRs. Examples from that project: frontend architecture (Angular standalone), API framework (Django REST), ingestion (PostgreSQL + JSON), deployment (Railway), testing and CI strategy.
- API/endpoint docs.
- Architecture diagrams as Markdown: data flow, deployment, and system overview.
- Handoff: next steps, summary, and a reviewer guide.
- Operations, project, QA, security, setup, and wireframes.

Review the generated docs. Do not assume they were read in full.

The generic master prompt that produces and updates this layout is the `master-doc-prompt` skill. Follow that skill. Do not keep a second copy of the prompt here.

> "I could literally just hand this off to someone, they plug in AI, and it knows."
