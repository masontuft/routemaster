---
name: project-architecture-file
description: Use on the first day of a new project, before asking AI to generate features.
---

# Architecture file before features

Spend the first day of a project, a few hours, on the architecture file and the skills files, before generating features.

1. Create an architecture file (for example `ARCHITECTURE.md`) that states what you want:
   - app pattern (for example MVC)
   - CSS approach (for example modern native nested CSS with imports and layers)
   - UI style: the base style, any per-page or per-section overrides, the palette name, and whether `ui-design-mobile` applies. Record the names only. The question is in `master-doc-prompt`. Do not copy the style rules.
   - stack
   - deployment
2. If the right terms are unknown, ask first: "I want the best, most efficient, latest X. What is that called? What are the terms? Where's the spec?" Ask for spec links and verify them.
3. Add this rule: "Any time we add a major feature, there needs to be a test file associated."

> "So you can just tell it in your architecture thing: any time we add a major feature, there needs to be a test file associated."

The decision tree and the files it writes are the `master-doc-prompt` skill. Follow that skill on day one, and when the repo already has code. Do not keep a second copy of the prompt here.
