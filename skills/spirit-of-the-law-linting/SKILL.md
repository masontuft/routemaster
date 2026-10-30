---
name: spirit-of-the-law-linting
description: Use when a repo has ESLint (or similar) rules that AI agents follow too literally.
---

# Spirit of the law for lint rules

AI follows the letter of the law. A strict line-length rule made it wrap lines in unreadable ways. Steer it with severity, and keep the shared config stable.

1. Save the shared flat config below as `eslint.config.mjs`. A project layers its framework preset (Expo, Next, and so on) in the marked slot, before the shared rules, so these severities stay in force. Do not use `@stylistic/eslint-plugin`'s `configs.customize` or `configs.recommended`. Their defaults turn on single quotes and turn semicolons off.
2. Exceptions go inline in the file, as an ignore comment for those lines only. Never change the shared config to make an exception.
3. Treat severities this way:
   - `error` is the letter of the law.
   - `warn` is the spirit of the law: try to follow it, and default to the more developer-friendly, readable solution. Example: leave a long line alone rather than wrap it awkwardly. Do not set ESLint `--max-warnings` to `0`. That turns a warning into a failed lint.
4. Use the VS Code ESLint extension so many rules auto-fix on save.

Formatting rules (`indent`, `semi`, `eol-last`, `no-trailing-spaces`, `max-len`, `quotes`, `comma-dangle`) are deprecated in ESLint core, so this config uses `@stylistic/eslint-plugin` for them. `eqeqeq`, `curly`, `no-debugger`, and `arrow-body-style` stay core rules. `curly` and `arrow-body-style` are frozen, and they still load. Quote style and trailing commas are turned off, including the core names, so a preset cannot turn them back on.

`typescript-eslint`'s `strict` preset is for correctness. `noImplicitAny` is part of `strict` in `tsconfig.json`. `noImplicitReturns` is not part of `strict`, so set it beside `strict`. Do not add ESLint rules to stand in for those two. The preset does ban an explicit `any` (`@typescript-eslint/no-explicit-any`). That is a different rule.

Add runtime globals (browser, node, Jest, and so on) in the project file. They differ per project, so they are not in this base.

Install with PNPM. `typescript-eslint` 8.72 supports TypeScript `>=4.8.4 <6.1.0` and rejects TypeScript 7, so the install pins the TypeScript 6 line until that peer range moves:

```bash
pnpm add -D eslint @eslint/js typescript-eslint @stylistic/eslint-plugin typescript@6
```

```js
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import stylistic from "@stylistic/eslint-plugin";
import tseslint from "typescript-eslint";

export default defineConfig([
    globalIgnores(["dist/**", "coverage/**"]),
    {
        name: "spirit-of-the-law",
        files: ["**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}"],
        extends: [
            js.configs.recommended,
            // Project slot. Put the framework flat preset here (Expo, Next, and so on).
            // It is listed before the shared rules so the severities in `rules` stay in force.
            tseslint.configs.strict,
        ],
        plugins: {
            "@stylistic": stylistic,
        },
        rules: {
            // Letter of the law: correctness, and formatting that can auto-fix.
            "eqeqeq": ["error", "always"],
            "curly": ["error", "all"],
            "no-debugger": "error",
            "@stylistic/indent": ["error", 4],
            "@stylistic/semi": ["error", "always"],
            "@stylistic/eol-last": ["error", "always"],
            "@stylistic/no-trailing-spaces": "error",

            // Do not enforce quote style or trailing commas, even if a preset turned them on.
            "quotes": "off",
            "@stylistic/quotes": "off",
            "comma-dangle": "off",
            "@stylistic/comma-dangle": "off",

            // Spirit of the law: prefer the readable form. Warn, do not fail the lint.
            "@stylistic/max-len": ["warn", {
                "code": 120,
                "ignoreUrls": true,
                "ignoreStrings": true,
                "ignoreTemplateLiterals": true,
            }],
            "arrow-body-style": ["warn", "always"],
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": "warn",
        },
    },
]);
```

`tsconfig.json` carries the TypeScript strictness this config does not:

```json
{
    "compilerOptions": {
        "strict": true,
        "noImplicitReturns": true
    }
}
```

A project-specific guardrail is another letter-of-the-law rule: `error`, with a comment that says why. Keep it in the project file, not in this shared base. This is the shape, not a path from any one repo:

```js
// Letter of the law for this repo: feature code may not reach into another
// feature's internals. The public entry is the only import path.
"no-restricted-imports": ["error", {
    "patterns": [{
        "group": ["@app/*/internal/**"],
        "message": "Import another feature only through its public entry.",
    }],
}],
```

> "hey, when you see something in ESLint that says warn, treat that as the spirit of the law. Meaning, try to enforce that rule, but default to a solution that is more dev-friendly."
>
> "In a new line of over 120 characters, you need to rewrite that line… If you really can't split it, then we add a comment that says ignore the rule for these lines only. And you do that in the file, not here."
