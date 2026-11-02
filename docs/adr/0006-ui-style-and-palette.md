# ADR 0006: UI Style and Palette

## Status

Accepted

## Date

2026-10-30

## Context

The UI style rules live in the skills: `ui-design-foundations` and the three `ui-style-*` skills. This ADR records the choice only and does not copy their rules.

## Decision drivers

- Most of Routemaster is forms, tables and dashboards, which is the use case the conservative style names.
- The site also has public marketing pages and error pages where a stronger look is acceptable.

## Decision

- Base style: `ui-style-conservative`.
- Page and section overrides:
  - Marketing pages (home, services and pricing, about, contact) use `ui-style-futuristic`.
  - The custom 404 and error pages use `ui-style-over-the-top`.
  - Everything else (login, register, request form, customer dashboard, dispatcher routes, owner and admin dashboards, reviews) uses the base style.
- Palette: `enterprise`.
- Mobile platform layer: `ui-design-mobile` applies as phone-browser responsiveness for this website only. There is no native app in this repo.

## Alternatives considered

- Palettes `health` and `premium`, from `ui-design-foundations`. The `health` palette's brand and accent swatches can only be fills. `premium` is dark-first.
- No overrides (an empty map). Mason chose to override.

## Consequences

- The foundations floors and the shared palette apply on every page, including the loud ones.
- Each extra style is another ruleset to follow and review.
- Mason read the "separate project" note on mobile as: this repo is a website, so the mobile layer is only about phone browsers. Revisit if a native app appears.
- Built (segments 8a and 8b): the base, the futuristic marketing pages (home, services, contact) and the over-the-top 404 and error pages. The 403 and 429 pages stay conservative. Fonts are the system stack only, so no font files or external requests; the loud pages use "Arial Black" or Impact when installed.
- Not built: the About page, which waits for copy from Mason ([#24](https://github.com/masontuft/routemaster/issues/24)).

## References

- `skills/ui-design-foundations/SKILL.md`
- `skills/ui-style-conservative/SKILL.md`
- `skills/ui-style-futuristic/SKILL.md`
- `skills/ui-style-over-the-top/SKILL.md`
- `skills/ui-design-mobile/SKILL.md`
