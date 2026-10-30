---
name: coding-style-preferences
description: Use when telling agents how code should look in a project.
---

# Coding style preferences

Tell agents how code should look. These are Mason's rules. The Coding style section of `AGENTS.md` points here, so this is the single place they live. Mason still reviews every change for style before it merges.

- Four-space indentation, not two.
- No shorthand. Write code out in full, for example a full arrow function. Shortening everything gets hard to read.
- Package manager: "Use PNPM. Never NPM."
- This project uses plain JavaScript as ES modules: `import` and `export`, never CommonJS `require`. No TypeScript here, because the CSE 340 final project is plain Node and Express with ESM. Elsewhere, TypeScript runs in strict mode, with no implicit returns and no implicit `any`.
- Express.js backends follow strict MVC. Keep code in separate `models/`, `controllers/` and `views/` folders.
- Name variables in `camelCase` and classes in `PascalCase`.

> "Use PNPM. We're more efficient. Never NPM."

## UI styling

Styling and UI decisions live in the UI skills, not in this file. The source of truth is `ui-design-foundations`, then the style skill the project or page selected: `ui-style-conservative`, `ui-style-futuristic`, or `ui-style-over-the-top`. `ui-design-mobile` is a platform layer on top of that style once its skill has landed. When writing or reviewing UI code, apply the rules of the style skill named in the project's `AGENTS.md` mapping for that page or section.

Build and start commands are a per-project decision. Ask Mason for them in each project. Do not invent them.
