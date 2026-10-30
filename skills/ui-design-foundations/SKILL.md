---
name: ui-design-foundations
description: Use when building or reviewing any UI, before applying a ui-style-* skill, to enforce the shared accessibility, palette, spacing, token, performance, and anti-slop floors.
---

# UI design foundations

Every interface starts here, then applies the style skill the project selected. These floors are the letter of the law for accessibility, the shared palette, units, and performance. When a style skill is loaded it is authoritative for its rules. Foundations floors still apply. A style may add a rule or make a floor stricter, including radius, depth, motion, type scale, density, and how it uses the shared colors. It must not loosen a floor, and it must not override or redefine the brand palette. Mason signs off before an `error` ships, and he can override a `warn` when the content, the reading, or his judgment calls for it.

Project docs record the choice and point at the skills. They do not copy these rules. `master-doc-prompt` asks the question. The answer lives in the project's `AGENTS.md` or an ADR.

Phone, tablet, and foldable UI also loads `ui-design-mobile`. When that skill is loaded it is authoritative for mobile rules. These floors still apply, and it may only make a floor stricter.

These labels match `spirit-of-the-law-linting`. `error` is the letter of the law. `warn` is the spirit of the law: follow it, and prefer the readable solution when the content needs an exception.

Headings in UI copy (H1 to H6), titles, call-outs, and calls to action follow `typography-modified-chicago-case` in every style. All-caps display type is a CSS `text-transform` on source text that is already in that case, so screen readers and the casing rule both still hold.

## Which style to apply

Apply this skill first. Then apply the style named for that page or section. The default is one base style. A page or section uses another style only when the project's `AGENTS.md` or an ADR maps it. The rules for a style live only in that skill. This table is the router.

| Skill | Use when |
| --- | --- |
| `ui-style-conservative` | People are finishing a task: forms, settings, checkout, admin, dashboards, docs |
| `ui-style-futuristic` | Marketing, a launch, the app shell, onboarding |
| `ui-style-over-the-top` | A campaign, a portfolio, or one hero moment |
| `ui-design-mobile` | A platform layer that combines with the style of the page. It does not replace that style. Its rules live in that skill once the skill has landed |

Example from the research: KOR settings stay conservative, and the recap is over the top.

## Accessibility

All of these are `error`.

1. **Text contrast.** At least 4.5:1 for body text and 3:1 for large text, meaning 24 px regular or 18.66 px bold and up ([WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)). Apple uses the same AA thresholds, with text at 17 pt or below at 4.5:1 ([HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).
2. **Non-text contrast.** Input borders, icons that carry meaning, focus rings, and chart lines need 3:1 against what is next to them ([SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
3. **Color is never the only signal.** Pair color with text, an icon, or a pattern ([SC 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)).
4. **Target size.** The WCAG floor is 24×24 CSS px, or enough spacing that a 24 px circle centered on each target does not overlap another ([SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)). The house rule is stricter: 44×44 pt on iOS, 48×48 dp on Android, and 44×44 CSS px on web for primary controls. Apple's default control size is 44×44 pt with a 28×28 pt minimum ([HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)). Android says "at least 48 dp" ([Android accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility)). Grow the hit area with padding or `hitSlop` when the visual is smaller.
5. **Focus.** Keep a focus indicator. `outline: none` with no replacement fails [SC 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html). Use `:focus-visible` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible)) with a solid ring at least 2 px thick and a 3:1 change of contrast. That is the AAA bar of [SC 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html), and the house rule adopts it. An inset ring is at least 3 px. Over images or gradients, use a two-color ring (technique C40). Sticky headers must not cover the focused element ([SC 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)).
6. **Motion safety.** Nothing flashes more than 3 times a second ([SC 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)). Anything that moves on its own for more than 5 seconds needs pause, stop, or hide ([SC 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)). Every non-essential animation honors `prefers-reduced-motion` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion), [SC 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)). Motion is never the only way to convey something. Apple's HIG says "make motion optional" ([HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion)).
7. **Text resizing and reflow.** The layout survives 200% text size ([SC 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)) and a 320 CSS px viewport with no horizontal scrolling ([SC 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)). It also survives user text spacing of 1.5 line height, 2× paragraph spacing, 0.12 em letter spacing, and 0.16 em word spacing ([SC 1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)). On native, respect Dynamic Type and font scale, and do not hard-cap it below 200% (Apple asks for at least 200%).
8. **DOM order equals visual order.** Reordering with grid placement or `order` must not break tab or reading order ([MDN grid accessibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Accessibility), [WCAG C32](https://www.w3.org/WAI/WCAG22/Techniques/css/C32)).
9. **Semantics first.** Use real `<button>`, `<a>`, `<label>`, and headings in order. On React Native, set `accessibilityRole` and `accessibilityLabel` on every pressable ([SC 1.3.1](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html)).
10. **Dragging has an alternative.** Any drag gesture also works with a single tap or click ([SC 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)).

## Layout, units, and tokens

- `error`: Build mobile-first. Write base styles for the smallest screen, then add `min-width` queries.
- `error`: Use `rem` for type and spacing on web and `dp` (React Native's unitless numbers) on native. Use `px` only for hairlines, borders, and shadow offsets.
- `error`: Spacing comes from the token scale. Magic numbers are out. Carbon's FAQ says to avoid off-scale values "whenever possible" ([Carbon spacing](https://carbondesignsystem.com/elements/spacing/overview/)).
- `error`: Use a 4 px base grid (8 px for over the top). Line heights snap to the grid. GOV.UK snaps every line height to a 5 px multiple for vertical rhythm ([GOV.UK type scale](https://design-system.service.gov.uk/styles/type-scale/)), which is the same idea on a different base.
- `error`: Components read semantic tokens (`--color-text`, `--color-surface`), never raw palette values. Dark and high-contrast themes swap tokens, not component CSS ([Evil Martians on OKLCH palettes](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)).
- `warn`: Author colors in OKLCH. It is Baseline widely available ([MDN `oklch()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch)). Its perceptual lightness makes hover and pressed states predictable: `oklch(from var(--accent) calc(l - 0.1) c h)`. Put wide-gamut P3 values inside `@media (color-gamut: p3)` with an sRGB fallback, because Chrome and Safari still clip out-of-gamut colors instead of mapping them ([Evil Martians](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl), [MDN `color-gamut`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/color-gamut)). OKLCH lightness alone is not a contrast check. Verify with a WCAG checker.
- `warn`: Use container queries for component-level responsiveness and media queries for page-level layout. Size containers are Baseline widely available ([MDN `container-type`](https://developer.mozilla.org/en-US/docs/Web/CSS/container-type)).
- `warn`: Keep body text lines to about 45–75 characters (`max-inline-size: 65ch`). GOV.UK's two-thirds column exists for the same reason, at "no more than 75 characters per line" ([GOV.UK layout](https://design-system.service.gov.uk/styles/layout/)).
- `warn`: Use `text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs. It is Baseline ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-wrap)).

## Shared palette

When pages use different styles, these tokens are the single source of truth for the shared palette. Nav, the tab bar, and the page header use `--color-surface`, `--color-text`, and `--color-brand` on every page. A style may change the nav's material. It builds that material from these tokens. It does not replace `--color-brand` or `--color-accent` with another hue. Swapping palettes changes these tokens only. Components keep the semantic names.

The library below is Mason's one-accent guide, the swatches from the reel he shared. A project picks one palette by name, `health`, `premium`, or `enterprise`, in its `AGENTS.md`. There is no default, including for KOR. More palettes can be added the same way. Ratios below use the WCAG relative-luminance formula after the OKLCH value is converted to sRGB. A value marked derived is a lighter or darker step of a source hue. It is not a new hue.

- `warn`: Follow the guide's 60-30-10 split. About 60% is the dominant background, 30% is the secondary (headers, cards, section bands), and 10% is the accent. The accent goes on the primary action, the active nav state, and one key highlight per section.
- `warn`: The accent appears on at most one primary action per viewport.

Source swatches that fail 4.5:1 as body text stay available for large bands and for fills whose text is the passing `--color-on-*` color. Sky Blue on white is 2.12:1. Hot Pink on white is 2.65:1. Coral on white is 2.50:1. Bubblegum Pink on white is 1.54:1. All four fail large text as well. Electric Blue on white is 3.83:1, so it passes large text and the 3:1 UI floor, and it fails body text.

### Health / light

Sky Blue `#00BFFF` is the base, white `#FFFFFF` is the neutral, Hot Pink `#FF69B4` is the accent.

| Token | Value | Pair |
| --- | --- | --- |
| bg | `#FFFFFF` source | |
| surface | `#EEF7FC` derived | |
| text | `#005A7B` derived | 7.04:1 on bg and on surface |
| text-muted | `#0078A1` derived | 4.60:1 on bg and on surface |
| border | `#0093C6` derived | 3.23:1 on bg and on surface |
| brand | `#00BFFF` source | white text 2.12:1, fill only |
| on-brand | `#004862` derived | 4.71:1 on brand |
| accent | `#FF69B4` source | white text 2.65:1, fill only |
| on-accent | `#62133F` derived | 4.71:1 on accent |
| focus | the text color | brand is 2.12:1 on white, so the ring cannot be the source swatch |

Dark scheme, derived from the sky hue. Text is the source Sky Blue, 8.49:1 on the dark bg and 7.08:1 on the surface.

### Premium / dark

Midnight Blue `#191970` is the base. The reel called this Midnight Black. Electric Blue `#007FFF` is the secondary. The accent hex `#FF7F50` is the CSS named color Coral. The guide's label says Cantaloupe Orange.

| Token | Value | Pair |
| --- | --- | --- |
| bg | `#191970` source | |
| surface | `#343B58` derived | |
| text | `#EAEEFC` derived | 12.82:1 on bg, 9.48:1 on surface |
| text-muted | `#A0A7C2` derived | 4.60:1 on bg and on surface |
| border | `#7B89BD` derived | 3.22:1 on bg and on surface |
| brand | `#007FFF` source | white text 3.83:1, large text only. 2.87:1 on the dark surface, so it is not the focus ring |
| on-brand | `#001333` derived | 4.80:1 on brand, 7.37:1 on the accent |
| accent | `#FF7F50` source | white text 2.50:1, fill only. As text on the midnight bg it is 5.94:1, so a short highlight may use it. Body text stays `--color-text` |
| focus | the border color | Electric Blue fails 3:1 on the surface |

Light scheme is derived. Midnight Blue as text is 13.77:1 on the light bg. Electric Blue on that bg is 3.55:1 and 3.31:1 on the surface, so it passes the focus floor and fails body text.

### Enterprise / clean

Deep Blue `#000080` is the base, white `#FFFFFF` is the neutral, Bubblegum Pink `#FFC0CB` is the accent.

| Token | Value | Pair |
| --- | --- | --- |
| bg | `#FFFFFF` source | |
| surface | `#F0F5FF` derived | |
| text, brand | `#000080` source | 16.01:1 on bg, 14.65:1 on surface |
| on-brand | `#FFFFFF` source | 16.01:1 on brand |
| text-muted | `#526EAA` derived | 4.61:1 on bg and on surface |
| border | `#6B8EDA` derived | 3.23:1 on bg |
| accent | `#FFC0CB` source | 1.54:1 on white, fill only |
| on-accent | `#000080` source | 10.41:1 on the accent |
| focus | brand | 16.01:1 on white |

Dark scheme uses Deep Blue as the background. The brand lightens so a button is not the same color as the page. White text on that derived brand is 4.64:1. Bubblegum Pink as text on Deep Blue is 10.41:1. Body text stays white. The pink stays the accent.

### Status

Danger and success keep the hues already defined in this skill. They are not reel swatches. On white, danger is 6.63:1 and success is 6.15:1. On Midnight Blue those same values fall to 2.24:1 and 2.41:1, so the dark scheme uses a lighter step of the same hue. Warning and info have no values.

```css
/* Palette library. Mason's one-accent guide.
   Set data-palette to health, premium, or enterprise after he picks.
   Do not choose one for KOR. Components read the semantic names only. */

:root {
    --color-danger: oklch(0.5000 0.1900 27.00);   /* existing hue, 6.63:1 on white */
    --color-success: oklch(0.4800 0.1200 150.00); /* existing hue, 6.15:1 on white */
}

@media (prefers-color-scheme: dark) {
    :root {
        --color-danger: oklch(0.7778 0.1302 27.00);   /* derived, 7.01:1 on Midnight Blue */
        --color-success: oklch(0.7506 0.1200 150.00); /* derived, 7.04:1 on Midnight Blue */
    }
}

[data-palette="health"] {
    color-scheme: light;
    --color-bg: oklch(1 0 0);                         /* #FFFFFF source */
    --color-surface: oklch(0.9700 0.0120 231.64);     /* #EEF7FC derived */
    --color-text: oklch(0.4405 0.0897 231.64);        /* #005A7B derived, 7.04:1 */
    --color-text-muted: oklch(0.5365 0.1091 231.64);  /* #0078A1 derived, 4.60:1 */
    --color-border: oklch(0.6241 0.1269 231.64);      /* #0093C6 derived, 3.23:1 */
    --color-brand: oklch(0.7554 0.1534 231.64);       /* #00BFFF Sky Blue source */
    --color-on-brand: oklch(0.3757 0.0766 231.64);    /* #004862 derived, 4.71:1 on brand */
    --color-accent: oklch(0.7283 0.1971 352.00);      /* #FF69B4 Hot Pink source */
    --color-on-accent: oklch(0.3409 0.1200 352.00);   /* #62133F derived, 4.71:1 on accent */
    --color-focus: var(--color-text);
}

@media (prefers-color-scheme: dark) {
    [data-palette="health"] {
        color-scheme: dark;
        --color-bg: oklch(0.2000 0.0400 231.64);          /* #001925 derived */
        --color-surface: oklch(0.2700 0.0500 231.64);     /* #052A3A derived */
        --color-text: oklch(0.7554 0.1534 231.64);        /* #00BFFF source, 8.49:1 on bg */
        --color-text-muted: oklch(0.6416 0.1200 231.64);  /* #2599C8 derived, 4.63:1 */
        --color-border: oklch(0.5522 0.1000 231.64);      /* #237CA2 derived, 3.20:1 */
        --color-brand: oklch(0.7554 0.1534 231.64);       /* #00BFFF source */
        --color-on-brand: oklch(0.3757 0.0766 231.64);    /* #004862 derived, 4.71:1 */
        --color-accent: oklch(0.7283 0.1971 352.00);      /* #FF69B4 source */
        --color-on-accent: oklch(0.3409 0.1200 352.00);   /* #62133F derived, 4.71:1 */
        --color-focus: var(--color-brand);
    }
}

[data-palette="premium"] {
    color-scheme: dark;
    --color-bg: oklch(0.2881 0.1436 272.76);          /* #191970 Midnight Blue source */
    --color-surface: oklch(0.3600 0.0500 272.76);     /* #343B58 derived */
    --color-text: oklch(0.9500 0.0200 272.76);        /* #EAEEFC derived, 12.82:1 on bg */
    --color-text-muted: oklch(0.7320 0.0400 272.76);  /* #A0A7C2 derived, 4.60:1 */
    --color-border: oklch(0.6379 0.0800 272.76);      /* #7B89BD derived, 3.22:1 */
    --color-brand: oklch(0.6131 0.2120 256.33);       /* #007FFF Electric Blue source */
    --color-on-brand: oklch(0.1952 0.0701 256.33);    /* #001333 derived, 4.80:1 on brand */
    --color-accent: oklch(0.7351 0.1680 40.25);       /* #FF7F50 Coral source */
    --color-on-accent: var(--color-on-brand);         /* 7.37:1 on Coral */
    --color-focus: var(--color-border);
}

@media (prefers-color-scheme: light) {
    [data-palette="premium"] {
        color-scheme: light;
        --color-bg: oklch(0.9750 0.0117 272.76);          /* #F4F6FF derived */
        --color-surface: oklch(0.9500 0.0200 272.76);     /* #EAEEFC derived */
        --color-text: oklch(0.2881 0.1436 272.76);        /* #191970 source, 13.77:1 on bg */
        --color-text-muted: oklch(0.5299 0.0800 272.76);  /* #5C689A derived, 4.65:1 */
        --color-border: oklch(0.6184 0.1600 256.33);      /* #3D85E3 derived, 3.20:1 */
        --color-brand: oklch(0.6131 0.2120 256.33);       /* #007FFF source */
        --color-on-brand: oklch(0.1952 0.0701 256.33);    /* #001333 derived, 4.80:1 */
        --color-accent: oklch(0.7351 0.1680 40.25);       /* #FF7F50 source */
        --color-on-accent: var(--color-on-brand);
        --color-focus: var(--color-brand);                /* 3.31:1 on surface */
    }
}

[data-palette="enterprise"] {
    color-scheme: light;
    --color-bg: oklch(1 0 0);                             /* #FFFFFF source */
    --color-surface: oklch(0.9700 0.0141 264.05);         /* #F0F5FF derived */
    --color-text: oklch(0.2711 0.1879 264.05);            /* #000080 Deep Blue source, 16.01:1 */
    --color-text-muted: oklch(0.5449 0.1000 264.05);      /* #526EAA derived, 4.61:1 */
    --color-border: oklch(0.6542 0.1200 264.05);          /* #6B8EDA derived, 3.23:1 */
    --color-brand: oklch(0.2711 0.1879 264.05);           /* #000080 source */
    --color-on-brand: oklch(1 0 0);                       /* #FFFFFF source, 16.01:1 */
    --color-accent: oklch(0.8677 0.0735 7.09);            /* #FFC0CB Bubblegum Pink source */
    --color-on-accent: var(--color-text);                 /* 10.41:1 on accent */
    --color-focus: var(--color-brand);
}

@media (prefers-color-scheme: dark) {
    [data-palette="enterprise"] {
        color-scheme: dark;
        --color-bg: oklch(0.2711 0.1879 264.05);          /* #000080 source */
        --color-surface: oklch(0.3400 0.1000 264.05);     /* #1C346B derived */
        --color-text: oklch(1 0 0);                       /* #FFFFFF source, 16.01:1 on bg */
        --color-text-muted: oklch(0.8000 0.0400 264.05);  /* #B1BED8 derived, 8.56:1 on bg, 6.40:1 on surface */
        --color-border: oklch(0.7500 0.0800 264.05);      /* #94AEE1 derived, 7.17:1 on bg */
        --color-brand: oklch(0.5672 0.1600 264.05);       /* #4570D4 derived, white text 4.64:1 */
        --color-on-brand: oklch(1 0 0);                   /* #FFFFFF source */
        --color-accent: oklch(0.8677 0.0735 7.09);        /* #FFC0CB source, 10.41:1 as text on bg */
        --color-on-accent: oklch(0.2711 0.1879 264.05);   /* #000080 source, 10.41:1 on accent */
        --color-focus: var(--color-text);
    }
}
```

### Adding a palette

Name it. Map it onto the same semantic tokens (`--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-brand`, `--color-on-brand`, `--color-accent`, `--color-on-accent`, `--color-focus`). Give the source. Run the contrast table for every text and background pair, in light and dark, and label any same-hue step as derived. Record the palette name in the project's `AGENTS.md`. Do not invent a hue the source did not give. Another palette is added the same way. This library is not closed at three.

A wide-gamut override, when the project has one, is a second value of the brand token inside `@media (color-gamut: p3)` in this file. The guide's hexes are sRGB. It does not give a P3 brand.

TODO (Mason): pick the project's palette (`health`, `premium`, or `enterprise`). Do not choose a default.

TODO (Mason): warning and info have no source hue. Add them here if the product needs them. Do not invent them.

## Interaction and feedback

- `error`: Every interactive element has distinct default, hover (web), pressed, focus-visible, disabled, and loading states. Disabled stays recognizable, and it is not the only signal for why an action is unavailable.
- `error`: Give feedback within 100 ms of input. NN/g puts simple feedback animations at about 100 ms ([NN/g animation duration](https://www.nngroup.com/articles/animation-duration/)).
- `warn`: Use skeleton screens for loads of about 1–10 s and a spinner for short ones ([NN/g skeleton screens](https://www.nngroup.com/articles/skeleton-screens/)).
- `warn`: Follow [Nielsen's 10 heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/), especially visibility of system status, consistency, and user control and freedom.

## Performance budget (web)

- `error`: Hit Core Web Vitals at the 75th percentile: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 ([web.dev Web Vitals](https://web.dev/articles/vitals)).
- `error`: Animate only `transform`, `opacity`, and `filter`. Leave layout properties (`width`, `top`, `margin`) alone. Animating them causes layout shifts and jank ([web.dev CLS](https://web.dev/articles/optimize-cls)).
- `warn`: Use at most 2 font families and 4 font files per page, with `font-display: swap` and preloaded hero fonts. Prefer one variable font file over several static weights ([Google Fonts on variable fonts](https://fonts.google.com/knowledge/introducing_type/introducing_variable_fonts)).

## React Native and Expo vs web

Generate web tokens and native tokens from one JSON source so they do not drift. Style-specific native shadows and glass live in the style skill that owns them. This table is the shared translation.

| Concern | Web (React, Next.js) | React Native and Expo |
| --- | --- | --- |
| **Tokens** | CSS custom properties, as in each style's starter block | A typed `tokens.ts` object (`as const`) consumed through a theme context |
| **Units** | `rem` for type and space, `px` for hairlines | Unitless numbers are dp. Use `PixelRatio` only for hairlines ([RN PixelRatio](https://reactnative.dev/docs/pixelratio)) |
| **Color format** | `oklch()` with P3 behind `@media (color-gamut: p3)` | RN does not parse `oklch()`. It supports hex, `rgb()`, `hsl()`, and `hwb()` ([RN colors](https://reactnative.dev/docs/colors)). Author in OKLCH, convert to hex at build time (with culori or Color.js), and store both |
| **Dark mode** | `prefers-color-scheme` and `light-dark()` | `useColorScheme()` and `userInterfaceStyle: "automatic"` in app config ([Expo color themes](https://docs.expo.dev/develop/user-interface/color-themes/)) |
| **Type scaling** | `rem` and `clamp()`; test at 200% zoom | Respect `allowFontScaling`. Use `maxFontSizeMultiplier` only on display type (around 1.5), never on body text. Fluid display sizing comes from `useWindowDimensions()` ([RN](https://reactnative.dev/docs/usewindowdimensions)) |
| **Fonts** | Variable `woff2`, `font-display: swap` | `expo-font` with a config plugin, embedded at build ([Expo fonts](https://docs.expo.dev/develop/user-interface/fonts/)). Variable-axis animation is not practical, so ship 2–3 static weights of the families the style already uses |
| **Reduced transparency** | `prefers-reduced-transparency` (limited) plus `prefers-contrast` | `AccessibilityInfo.isReduceTransparencyEnabled()` (iOS) |
| **Reduced motion** | `prefers-reduced-motion` | Reanimated defaults every animation to `ReduceMotion.System`, so `withTiming` and `withSpring` jump straight to the end value, and exiting and shared transitions are skipped ([Reanimated accessibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/)). `error`: Never set `ReduceMotion.Never` on decorative motion. Use `useReducedMotion()` to swap in a fade |
| **Page transitions** | View Transitions API | expo-router and react-native-screens native stack transitions |
| **Scroll effects** | CSS scroll-driven animations | Reanimated `useScrollViewOffset` and `useAnimatedScrollHandler` on the UI thread |
| **Targets** | 44 CSS px house rule | 44 pt (iOS) and 48 dp (Android). Use `hitSlop` to grow small visuals |
| **Haptics** | Not available | `expo-haptics` as a non-visual channel for state changes. Apple suggests haptics as an alternative to motion |

## Avoid AI slop

AI slop is a bundle of statistical defaults, not one popular choice. Anthropic describes it as distributional convergence: without a recorded brand, models sample the high-probability center of the web, which readers now recognize on sight ([Claude cookbook: prompting for frontend aesthetics](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)). A measured taxonomy of 27 tells, checked against 202 design-led sites, found the same center, and found that a single common choice inside a real system is not the failure. Stripe uses many purple accents and scores as designed. Linear ships Inter with a real type scale. The tell is the default bundle with nothing decided around it ([ai-design-tells](https://github.com/hankimis/ai-design-tells)). Jeff Humble's field list (neon, aurora glow, emoji, purple gradients, cards on cards) matches that center ([Fountain Institute](https://pages.thefountaininstitute.com/posts/7-tells-that-a-ui-is-ai-generated)). So does the Design for AI checklist ([design.yaps.ai](https://design.yaps.ai/docs/principles)) and Slop Patterns' field guide ([sloppatterns.com](https://sloppatterns.com/)).

This is the only copy of these rules. A style skill points here. It does not repeat the list, and it does not loosen these rules.

Three moves fix a violation:

1. Tie every color to a foundations token, or to a derivation the active style defines from one. Tie radius, type, shadow, and motion to that style's tokens. Each one needs a reason: brand, status, or a rule in that style.
2. Use real content. When the number, the quote, or the label is not in the source, leave it out or mark `TODO (Mason):` with the fact you need. Do not invent it.
3. Record one distinctive brand choice per project in that project's `AGENTS.md`: the hue, the display face, or the single effect the style allows. The choice is Mason's.

Example. A generated maintenance screen opens with "Unlock the power of seamless cycling", three emoji cards, and `background-clip: text` on an indigo gradient. The replacement is the conservative log: `--color-text` and `--color-brand` from the shared palette, a 44 px button labeled "Save service", and the form fields in a list. The brand reason is the one recorded hue on the primary action. There is no second palette.

### Letter of the law

These are `error`. They do not ship without Mason's sign-off.

1. **Invented proof.** No fake statistics, testimonials, avatars, star ratings, or "Trusted by" logos. No lorem ipsum, "Your text here", "John Doe, CEO at Acme", or a Vite or React default document title presented as the product. Slop Patterns documents generated testimonials and placeholder people as tells ([sloppatterns.com](https://sloppatterns.com/)). The ai-design-tells copy family calls placeholder text "Lorem Shipsum" ([G3](https://github.com/hankimis/ai-design-tells)).
2. **Emoji and sparkle icons as chrome.** No emoji as section icons, bullets, headers, or nav items. No sparkle, wand, bot, or brain icon whose job is to mean "this feature is AI." Use the active style's icon set, next to a text label ([Fountain Institute](https://pages.thefountaininstitute.com/posts/7-tells-that-a-ui-is-ai-generated); [ai-design-tells C4 and H1](https://github.com/hankimis/ai-design-tells)). Name the feature by what it does. Put the model name in settings, if anywhere.
3. **Untouched component-library theme.** A starter palette is not the brand. That includes shadcn or Tailwind zinc with a near-black primary, default `rounded-*` and `shadow-*` utilities, and raw ramp classes (`bg-indigo-500`) with no semantic tokens ([Slop Patterns](https://sloppatterns.com/); [ai-design-tells A3](https://github.com/hankimis/ai-design-tells)). Map the library onto the active style's tokens before any screen. Every color, font, radius, shadow, and effect is a token with a reason.
4. **Gradient text.** Headings, stats, button labels, and body copy are one solid semantic color that passes the contrast floors. `background-clip: text` gradients are out ([Slop Patterns](https://sloppatterns.com/); [Design for AI](https://design.yaps.ai/docs/principles)).
5. **Filler claims.** A sentence that could move onto another product unchanged does not ship. That includes "Unlock the power of…", "Seamless", "Elevate", "Supercharge", "Next-generation", "Effortless", and "Build the future of…" ([Design for AI](https://design.yaps.ai/docs/principles); [ai-design-tells G1](https://github.com/hankimis/ai-design-tells)). Name the task this screen does, in the product's words.
6. **Decoration with no token.** A blob, mesh, glow, glass panel, or grain overlay that the active style does not define as a token does not ship. If you cannot name the token and the reason, delete it ([Design for AI](https://design.yaps.ai/docs/principles); [Fountain Institute](https://pages.thefountaininstitute.com/posts/7-tells-that-a-ui-is-ai-generated) on aurora glows with no light source).

### Spirit of the law

These are `warn`. Readability, the content, or Mason's judgment can override one. If three or more of them are true on the same screen and the project has not recorded a brand choice that explains them, stop and ask Mason. Design for AI uses that "three or more" bar because the bundle, not any single tell, is what readers recognize ([design.yaps.ai](https://design.yaps.ai/docs/principles)).

1. **Indigo-to-violet as the unchosen accent.** Purple-to-blue is the default "innovative software" gradient ([Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics); [Fountain Institute](https://pages.thefountaininstitute.com/posts/7-tells-that-a-ui-is-ai-generated); [ai-design-tells A1 and A2](https://github.com/hankimis/ai-design-tells)). Purple itself can be the brand. The ai-design-tells corpus found Stripe's purple still scores as designed when the rest of the system is decided. Use a flat brand fill unless the active style names a gradient token and you can say what that gradient means. Keep a gradient inside one job.
2. **The hero, three identical cards, and a CTA.** A centered hero, an "Introducing" pill, three identical icon cards, a logo strip, and a generic button is the landing-page median ([ai-design-tells C1](https://github.com/hankimis/ai-design-tells); [Design for AI](https://design.yaps.ai/docs/principles); [Slop Patterns](https://sloppatterns.com/)). Use it when the content really is three equal things. Otherwise the content picks the structure: a list, a table, one anchor plus supporting tiles, or the task form. A generic "Get started" is this warning when the product has a real verb ([ai-design-tells G2](https://github.com/hankimis/ai-design-tells)).
3. **A face with no type decisions.** Inter, Roboto, and the system stack are allowed when the active style names them. The failure is one size band, default tracking, and no weight contrast ([ai-design-tells B1–B3](https://github.com/hankimis/ai-design-tells)). Apply that style's scale, weights, and tracking. A fashionable substitute reached for only to avoid Inter (Space Grotesk, Geist, Instrument Serif, Fraunces) is the same failure when the project did not record it ([Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)).
4. **One radius and one soft shadow on everything.** `rounded-2xl` and `shadow-lg` on buttons, cards, inputs, and images is a tell ([ai-design-tells C3 and E1](https://github.com/hankimis/ai-design-tells)). Use the style's radius and elevation tokens, which already differ by component. A card inside a card, and a different bright hue on every status pill, spend chrome that should mean something ([Fountain Institute](https://pages.thefountaininstitute.com/posts/7-tells-that-a-ui-is-ai-generated); [ai-design-tells A4 and E4](https://github.com/hankimis/ai-design-tells)).
5. **Spacing that does not show grouping.** The same padding on every card and the same gap between every section reads as a metronome ([ai-design-tells D1 and D2](https://github.com/hankimis/ai-design-tells)). So does a gap that jumps with no grouping reason. Vary space to show what belongs together, on the token scale. A value off that scale is already an error under Layout.
6. **The second-order template.** Told to avoid purple gradients, models converge again: warm cream with a terracotta or clay accent, near-black with one acid-green accent, broadsheet hairlines, features numbered 01 / 02 / 03, one highlighted word in the headline, and all-caps mono eyebrows on every section ([Anthropic frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md); [avoid-ai-design](https://github.com/funboy322/avoid-ai-design); [Slop Patterns, reflex cream](https://sloppatterns.com/)). Follow the recorded style. Leave the "more human" template alone.

## What a linter can check

Where a rule can be machine-checked, wire it as `error` in the project, following `spirit-of-the-law-linting`: inline exceptions only, and the shared config stays stable. The research names these checks. Visual-taste rules stay `warn`.

- Stylelint `color-no-hex` and `function-disallowed-list`, to force OKLCH and tokens.
- `stylelint-gamut`, for P3 colors that are not wrapped in a media query ([Evil Martians](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)).
- `eslint-plugin-jsx-a11y` and `eslint-plugin-react-native-a11y`, for labels and roles.

The contrast ratios in the palette library were computed with the WCAG relative-luminance formula after converting OKLCH to sRGB. Fluid `clamp()` values live in the style skills and are illustrative. Regenerate them with [Utopia](https://utopia.fyi/) for the real breakpoints.

TODO (Mason): the research names the Stylelint and jsx-a11y rules above and does not include a config. Add the real config if you want these checks enforced. Do not invent it.

TODO (Mason): add your own words on UI style; do not invent.
