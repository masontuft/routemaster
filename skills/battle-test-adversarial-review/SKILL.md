---
name: battle-test-adversarial-review
description: Use before signing off on AI-written features you lack time to test by hand.
---

# Battle testing

The human owns the result. Ship only when the tests pass, and still review the results. The human signs off.

1. Make sure each major feature has an associated test file (unit and end-to-end).
2. Battle-test the feature: poke holes in it, and pretend to be the worst-case user you could imagine. Example: gibberish appended to a route that lands somewhere it should not.
3. For every bug found, ask what the class of issue is called (examples given: forgery request, query injection) and add the term to the learning list.
4. Ship only when it all passes, and still review the results yourself. The human signs off.

> "let me go battle test this, let me go build holes at it, let me go pretend to be the worst case user you could ever imagine."
>
> "It falls on you at the end of the day, you're the person that can get fired, not AI."
