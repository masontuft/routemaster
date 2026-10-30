---
name: ui-style-conservative
description: Use when a project's AGENTS.md or ARCHITECTURE.md selects the conservative UI style, or when Mason asks for a quiet, task-first interface.
---

# Conservative UI style

Familiar, quiet, dense enough to be efficient, and impossible to misread. The UI gets out of the way. Apply `ui-design-foundations` first. When this skill is loaded it is authoritative for the rules below. Foundations floors still apply, including the shared palette. This skill may add a rule or make a floor stricter. It does not redefine brand or semantic colors. Mason signs off before an `error` ships, and he can override a `warn` when the task needs it.

This is the productive end of IBM Carbon. Its productive motion is "subtle and out of the way… appropriate for moments when the user needs to focus on completing tasks" ([Carbon motion](https://carbondesignsystem.com/elements/motion/overview/)). It is also GOV.UK's "start with a single column, two-thirds width" ([GOV.UK layout](https://design-system.service.gov.uk/styles/layout/)).

- **Use when:** People come to finish a task: forms, settings, checkout, admin, dashboards, docs, and the KOR app's maintenance logs and bike setup. Use it where trust matters (money, health, safety) and where the audience is broad or older.
- **Skip this style when:** The page exists to be remembered, like a brand launch or campaign. Pair it with a hero moment from another style instead.
- **Exemplars:** [GOV.UK](https://www.gov.uk/) and its [Design System](https://design-system.service.gov.uk/), [IBM Carbon](https://carbondesignsystem.com/elements/2x-grid/overview/), [GitHub Primer](https://primer.style/), [Shopify Polaris](https://shopify.dev/docs/api/polaris), [Atlassian](https://atlassian.design/foundations/spacing), and [Basecamp](https://basecamp.com/).

## Avoid AI slop

Shared anti-slop floors are in `ui-design-foundations`. This file does not repeat them. Stay inside the type, color, and radius rules below.

## Layout and spacing

- `error`: Use a 4 px base. Spacing tokens are 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, and 96 px (0.125–6 rem), which matches Carbon's `$spacing-01` to `$spacing-12` ([Carbon spacing](https://carbondesignsystem.com/elements/spacing/overview/)).
- `error`: Lay out in a single column on mobile. On wider screens, the main content sits in a two-thirds column with an optional one-third sidebar. Max page width is about 64 rem (1020 px in GOV.UK).
- `warn`: Keep density medium. Use 16 px padding inside cards and 24–32 px between sections. Tables and lists may go compact (8–12 px rows). Whole pages stay medium. Carbon puts it this way: "Sections of a UI are allowed to be dense, but the whole page should not be crowded."
- `warn`: Use space to show relationships before reaching for lines or boxes. Elements that are closer together read as related.

## Typography

- `error`: Body text is at least 16 px (1 rem) on web and 17 pt on iOS (the HIG default; 11 pt is the minimum) ([HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)). Body line height is 1.5 and headings use 1.1–1.25.
- `warn`: Use a type scale ratio of **1.2 (minor third)** with steps 0.833, 1, 1.2, 1.44, 1.728, and 2.074 rem. On mobile, cap H1 at about 2 rem. GOV.UK shrinks its 48 px heading to 32 px on small screens ([GOV.UK type scale](https://design-system.service.gov.uk/styles/type-scale/)).
- `warn`: Use the system font stack (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`) or one neutral sans like [Inter](https://rsms.me/inter/). Use at most 2 weights (400 and 600). Record which one the project uses. Do not swap in a display face to dodge the "Inter" tell. The tell is a missing scale, and this section is the scale.
- `warn`: Use tabular numerals (`font-variant-numeric: tabular-nums`) in tables, prices, and mileage.

## Color

- `error`: Use the foundations palette. This style adds no hues. The primary action uses `--color-brand`. Status uses `--color-danger` and `--color-success` only for status.
- `error`: Muted text uses `--color-text-muted` and input borders use `--color-border`. Both still have to pass the foundations contrast floors. Labels stay visible. Placeholder-only labels are out.
- `warn`: Dark mode is optional. Ship light mode first. NN/g found that people with normal vision tend to perform better in light mode, while some people with low vision prefer dark mode ([NN/g dark mode](https://www.nngroup.com/articles/dark-mode/)). If you offer dark mode, follow the OS setting through `prefers-color-scheme` and `light-dark()` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark)).

## Components and shape

- `error`: Radius is 4 px on inputs and buttons and 6 px on cards. Pills are for tags only.
- `warn`: Show depth with 1 px borders first. Use at most one shadow level for overlays like menus and dialogs. Atlassian's elevation model (surface, raised, overlay) is the reference ([Atlassian elevation](https://atlassian.design/foundations/elevation)).
- `error`: Primary buttons are solid `--color-brand`, secondary buttons are outlined, and tertiary actions are text links. Allow one primary button per view.
- `error`: Form labels sit above inputs, always visible. Errors are inline, in text plus an icon, with a summary at the top for long forms (the GOV.UK pattern).

## Motion

- `error`: Use durations from 70–240 ms: 70 ms for toggles, 110 ms for fades, 150 ms for small expansions, and 240 ms for toasts. That is Carbon's `fast-01` to `moderate-02` ([Carbon motion](https://carbondesignsystem.com/elements/motion/overview/)). Use nothing over 400 ms.
- `error`: Easing is Carbon productive `cubic-bezier(0.2, 0, 0.38, 0.9)` or M3 standard `cubic-bezier(0.2, 0, 0, 1)` ([M3 easing tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)). Linear easing is for spinners only.
- `error`: Decorative, looping, parallax, and scroll-linked motion are out. Page changes are instant or a fast fade. Fluent recommends "a quick fade transition instead of moving or sliding" for top-level navigation ([Fluent motion](https://fluent2.microsoft.design/motion)).
- `error`: Under reduced motion, set durations to near zero and remove all transforms.

## Imagery and icons

- `warn`: Use a single outline icon set at 20–24 px with a 1.5–2 px stroke, such as Material Symbols, SF Symbols, or Lucide. Icons sit next to a text label. Icon-only buttons are for universal meanings (close, search), and those still need an accessible name.
- `warn`: Photos are functional (product, part, bike) and sit beside text, never behind it.

## Pitfalls

- Making everything "clean" until hierarchy disappears. M3's expressive research found that emphasis helped people find the key action faster, so give the primary action real weight even in a calm UI.
- Light-gray text on white (`#999`), which fails 4.5:1.
- Hiding labels to look minimal. Placeholder-only inputs fail once the user starts typing.
- Shrinking touch targets to fit more in. Compact density is for desktop pointers. Touch keeps the house target size from `ui-design-foundations`.

## Starter tokens

Colors come from `ui-design-foundations`. This block does not set hues.

```css
/* Conservative: ui-style-conservative */
:root {
    /* Space: 4px base. 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96 px */
    --space-0: 0.125rem;
    --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem;
    --space-5: 1.5rem; --space-6: 2rem; --space-7: 2.5rem; --space-8: 3rem; --space-9: 4rem;
    --space-10: 5rem; --space-11: 6rem;

    /* Type: 1.2 ratio */
    --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --text-sm: 0.833rem; --text-base: 1rem; --text-lg: 1.2rem;
    --text-xl: 1.44rem; --text-2xl: 1.728rem; --text-3xl: 2.074rem;
    --leading-body: 1.5; --leading-heading: 1.2;
    --weight-regular: 400; --weight-strong: 600;
    --measure: 65ch;

    /* Shape and depth */
    --radius-control: 4px; --radius-card: 6px;
    --border-width: 1px;
    --shadow-overlay: 0 2px 8px oklch(0 0 0 / 0.12);
    --focus-ring: 2px solid var(--color-focus);
    --focus-offset: 2px;

    /* Motion (Carbon productive) */
    --ease-standard: cubic-bezier(0.2, 0, 0.38, 0.9);
    --dur-fast: 70ms; --dur-fade: 110ms; --dur-moderate: 150ms; --dur-toast: 240ms;

    --target-min: 2.75rem; /* 44px house rule */
}

@media (prefers-reduced-motion: reduce) {
    :root { --dur-fast: 0ms; --dur-fade: 0ms; --dur-moderate: 0ms; --dur-toast: 0ms; }
}

:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); }
```

On React Native this style maps onto platform defaults: solid surfaces, the system face, and the house target size from `ui-design-foundations`. Shadows use the `boxShadow` style prop (New Architecture only; outset needs Android 9+). Otherwise, `elevation` on Android and `shadow*` on iOS ([RN View style props](https://reactnative.dev/docs/view-style-props)).

TODO (Mason): add your own words on UI style; do not invent.
