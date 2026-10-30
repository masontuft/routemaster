---
name: cross-model-audit
description: Use after one AI (for example Codex, used when Claude tokens ran out) made significant changes, to have a different model audit the work.
---

# Cross-model audit

Have one model audit work done by another. The human still judges the result. The AI may defend a bad design.

1. Ask a different model: "We've made some changes, did it do a good job?" Point it at the schema snapshot and the ledger.
2. Weigh its proposals critically. The human makes the call.

Example from the source: an audit cut a 13-table design to 9. The auditing model at first was trying to fight for the larger design.

> "If you want to be a lead engineer, you want to let Codex just code everything, you still need to understand what it's doing because this is what we're hearing in interviews, you have to sign off of it."
