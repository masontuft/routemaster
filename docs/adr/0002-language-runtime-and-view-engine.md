# ADR 0002: Language, Runtime and View Engine

## Status

Accepted

## Date

2026-10-30

## Context

The course requires Node.js with Express, EJS or Liquid.js, and ES modules with no CommonJS. Mason's standing coding-style rule was TypeScript in strict mode. That rule is overridden for this project.

## Decision drivers

- The course says `require` is not allowed.
- Fewest moving parts on Render: no compile step.
- Output must be escaped by default, because the course grades input sanitization.

## Decision

- Language: plain JavaScript as ES modules (`import` and `export`). No TypeScript in this project.
- Runtime: Node.js 24, pinned in a `.node-version` file. Render's documented default for services created on or after 2026-10-21 is 24.22.1.
- Server framework: Express. Express 5 forwards rejected promises from async handlers to the error handler, which supports the course requirement for one global error handler.
- View engine: EJS. `<%=` escapes output and `<%-` does not. EJS has no built-in layouts, so layouts are built from include partials.

## Alternatives considered

- TypeScript strict (Mason's standing rule). Rejected for this project: it adds a build step and tooling the course does not require. The rule still applies elsewhere, and `coding-style-preferences` says so.
- Liquid.js. Its Express page shows only a CommonJS example, so ESM use is unverified, and its `outputEscape` option is off by default.

## Consequences

- No compile or build step for application code.
- Layout reuse depends on include partials. A layout helper dependency would need Mason's approval.
- Node is pinned to 24 in `.node-version` and `package.json` `engines`. Node's release table marked v22, v24 and v26 as LTS, but its end-of-life column was ambiguous, so end-of-life dates were not confirmed.
- Whether npm's default Express version is 5 was not verified. This repo depends on `express` 5.x directly.
- The Express app, EJS views, and the Node 24 pin are in the repo. The installed `express` dependency is 5.x (`package.json`).

## References

- Node.js releases: https://nodejs.org/en/about/previous-releases
- Render Node version: https://render.com/docs/node-version
- Express 5 migration guide: https://expressjs.com/en/guide/migrating-5.html
- EJS: https://ejs.co/ and https://github.com/mde/ejs
- LiquidJS Express page: https://liquidjs.com/tutorials/use-in-expressjs.html
- LiquidJS options: https://liquidjs.com/tutorials/options.html
