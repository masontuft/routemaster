# ADR 0005: CSS Approach

## Status

Accepted

## Date

2026-10-30

## Context

Routemaster has a UI, so a CSS approach is needed. The project has no front-end build step (see ADR 0002).

## Decision drivers

- No build step.
- Predictable cascade across the base style and per-page style overrides (ADR 0006).

## Decision

Native modern CSS: nesting, cascade layers, and `@import`, served as static files. A layer order is declared once, for example `@layer reset, base, components, pages;`, and files are imported into layers with `@import "x.css" layer(name);`.

## Alternatives considered

- Sass. MDN contrasts native nesting, which the browser parses, with preprocessor nesting. Sass needs a build step. Rejected.
- A component library. Not researched. Mason did not name one.

## Consequences

- `@layer` is Baseline Widely available since March 2022. The nesting selector is Baseline Widely available since December 2023.
- Each `@import` is a separate request. MDN's `@import` page does not discuss the performance cost, so this is general background. Several `<link>` tags in the EJS layout are an alternative if it matters.
- Nothing is built yet: Not currently implemented.

## References

- `@layer`: https://developer.mozilla.org/en-US/docs/Web/CSS/@layer
- `@import`: https://developer.mozilla.org/en-US/docs/Web/CSS/@import
- Nesting selector: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/Nesting_selector
- CSS nesting guide: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Nesting
