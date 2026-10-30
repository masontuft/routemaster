---
name: ui-style-over-the-top
description: Use when a project's AGENTS.md or ARCHITECTURE.md selects the over-the-top UI style, or when Mason asks for a loud, branded hero moment.
---

# Over the top UI style

Loud on purpose. Type, color, and motion carry the brand, and usability is protected by hard floors. Apply `ui-design-foundations` first. When this skill is loaded it is authoritative for the rules below. Foundations floors still apply, including the shared palette. This skill may add a rule or make a floor stricter. It does not redefine brand or semantic colors. Mason signs off before an `error` ships, and he can override a `warn` when the piece needs it.

This blends neo-brutalism ("high contrast, blocky layouts, bold colors, thick borders, and 'unpolished' elements", per [NN/g](https://www.nngroup.com/articles/neobrutalism/)) with maximalism ("rich colors, overlapping visuals, bold fonts, and dense compositions", per [Figma's 2026 trends](https://www.figma.com/resource-library/web-design-trends/)). It also borrows Awwwards-style kinetic type. NN/g's older guidance draws the line: brutalism "can be used effectively", and antidesign "should be avoided for most products" ([NN/g brutalism and antidesign](https://www.nngroup.com/articles/brutalism-antidesign/)). This ruleset is brutalism. Antidesign is out of bounds.

- **Use when:** Campaign and event microsites (a JMR Cycling race or launch page), Mason's portfolio, a "Wrapped"-style recap screen in KOR, the 404 page, empty states, celebration moments. M3 Expressive's advice applies: stick to "one or two hero moments in your product" ([M3 Expressive](https://m3.material.io/blog/building-with-m3-expressive)).
- **Skip this style when:** Forms, settings, checkout, account, anything used daily, or trust-critical flows. Google's own research warns that what suits a media app "might not be suitable for something like a banking interface", and that breaking basic patterns hurt usability ([Google Design research](https://design.google/library/expressive-material-design-google-research)).
- **Exemplars:** [Gumroad](https://gumroad.com/) and [Figma](https://www.figma.com/) (both cited by NN/g as neo-brutalist), [Liquid Death](https://liquiddeath.com/) (maximalism, per Figma), Awwwards' [Robot case study](https://www.awwwards.com/case-study-robot-visionary-mavericks-in-motion.html) ("maximalism, brutalism, and digital nostalgia") and [The Geek Designer SOTD](https://www.awwwards.com/sites/the-geek-designer), and the [Brutalist Websites](https://brutalistwebsites.com/) gallery.

## Avoid AI slop

Shared anti-slop floors are in `ui-design-foundations`. This file does not repeat them. The limits that belong to this style are the color, shape, and motion rules below.

## Layout and spacing

- `warn`: Use an 8 px base with **extreme scale contrast**. Pair tight 8 px internal gaps with huge 96–192 px section breaks. Asymmetric, overlapping, and broken grids are allowed on wide screens.
- `error`: Under the visual chaos, the **DOM order is the reading order**. On mobile, the layout collapses to a readable single column. Overlaps never cover text or controls.
- `error`: Padding around dense or bordered blocks is at least 24–32 px. NN/g's neo-brutalism advice is to "offset dense geometric shapes and thick borders with generous padding (e.g., 24–32px)."
- `warn`: Marquees, stickers, and rotated labels go in decorative layers with `aria-hidden`. They still need a token and a reason. A sticker with no role does not ship.

## Typography

- `warn`: Use a type scale ratio of **1.5 (perfect fifth) to 1.618 (golden)**, with fluid display type up to `clamp(3rem, 8vw + 1rem, 10rem)`. Headlines are at least 2× body size ([NN/g](https://www.nngroup.com/articles/neobrutalism/)).
- `error`: Pair a chunky, quirky, or condensed **display** face (headlines only) with a neutral **body** sans like Inter or Roboto. NN/g says to keep decorative or condensed faces off paragraphs. Body stays at least 16 px, 1.5 line height, and 65ch.
- `warn`: Variable-font axes (`wght`, `wdth`, `slnt`) can animate on hover and scroll for kinetic type ([MDN `font-variation-settings`](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variation-settings)).
- `error`: Kinetic text plays once on load or tracks scroll, then **settles**. The real text is in the DOM, with each split letter `aria-hidden` and the full string as an accessible label. It never loops for more than 5 s without a pause control ([SC 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)).
- `error`: All-caps display follows the `text-transform` rule in `ui-design-foundations`.

The shared performance warning is two font families and four files. This style's pair is the display face plus the body sans. The starter block also names a mono. Loading that mono makes a third family, which loosens the shared warning, so leave it out unless Mason signs off.

## Color

- `error`: Use **2–3 fill roles, all the brand hue**, plus the shared text and background. NN/g recommends limiting the palette to "2–3 bold, high-contrast colors" ([NN/g](https://www.nngroup.com/articles/neobrutalism/)). The research's pink, lime, blue, and yellow illustrated multiple fills. They are not tokens. Companions are derived from `--color-brand` with the hue channel left alone. The research did not give lightness steps for that derivation.
- `error`: Saturated colors are **fills**, and text on a brand fill is `--color-on-brand`. On the guide palettes, `--color-text` on Sky Blue, Hot Pink, Electric Blue, or Coral fails 4.5:1. Saturated text on a saturated fill is out (yellow on cyan is NN/g's own failing pair). Companion fills, when Mason confirms the steps, are rechecked the same way.
- `warn`: A P3 boost, when the project has one, lives on `--color-brand` in `ui-design-foundations`.
- `warn`: Dark mode uses the foundations dark tokens. Borders and offset shadows use `--color-text`.

## Components and shape

- `error`: Radius is **0** (hard corners) or **full pill**. In-between radii are out.
- `error`: Borders are 2–4 px solid ink. Shadows are **hard offsets with no blur** (`4px 4px 0 ink`, 8 px on hero cards). NN/g describes "a black drop shadow offset by 4px" ([NN/g](https://www.nngroup.com/articles/neobrutalism/)).
- `error`: State changes stay obvious without gradients. On press, the button shifts by the shadow offset and the shadow drops to 0. Hover adds an underline or a color shift. Focus is a 3 px ring offset outside the border, using `--color-focus`. When the fill is already `--color-brand`, the ring uses `--color-text` so it differs from the fill.
- `error`: On React Native, a hard offset is `boxShadow` on the New Architecture, using the build-time hex of `--color-text`, or an absolutely positioned view painted with `--color-text` behind the element.
- `warn`: Skeuomorphic and retro UI touches (Win98-style windows, pixel art) are allowed as decoration. They are never the only way to show controls.

## Motion

- `warn`: Use CSS scroll-driven reveals, kinetic type, marquee banners, and `steps()` easing for a deliberately janky retro feel. The default easing is snappy: `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot) for playful pops, at 200–500 ms. Hero sequences can reach 700–1000 ms (M3's extra-long tokens), but only for ambient motion the user did not trigger and does not wait on.
- `error`: There is **one hero moment per page** and **one or two per product**. Everything else gets the Conservative motion rules.
- `error`: Scroll-jacking is out. Scroll speed and scroll direction stay under the user's control. NN/g says scroll-jacking contradicts "user expectations, control, and freedom" ([NN/g scrolljacking](https://www.nngroup.com/articles/scrolljacking-101/)). Parallax stays shallow and decorative ([NN/g parallax](https://www.nngroup.com/articles/parallax-usability/)).
- `error`: Every scroll-driven effect sits behind `@supports (animation-timeline: …)` **and** `@media (prefers-reduced-motion: no-preference)`. Without them, content is static and fully visible.
- `error`: Hard color cuts over large areas stay below 3 a second.

## Imagery and icons

- `warn`: Use stickers, cut-outs, collage, grain, halftone, and duotone photos. Icons are thick-stroke (2.5–3 px) or hand-drawn. Imagery may overlap the grid. It stays off body text.
- `error`: Decorative images get `alt=""`. Meaningful images get real alt text.

## Performance

- `error`: The LCP element is text or a static image. A canvas, video, or WebGL scene is not the LCP element. Hero video is muted, has `playsinline` and a poster, and pauses under reduced motion.
- `warn`: Ship at most one display font file, subset to the glyphs you need. Lazy-load GSAP, Three.js, or Lottie only on the pages that use them.

## Pitfalls

- Sliding into antidesign: deliberately hard to use, illegible, or confusing navigation.
- More than 3 fill roles. That starts to look chaotic.
- Motion everywhere, so nothing stands out and vestibular users get sick.
- Low-contrast neon pairs like yellow on cyan, or pink text on cream.
- Copying the look into forms. Inputs, labels, and errors stay Conservative even on a loud page.

## Starter tokens

```css
/* Over the top: ui-style-over-the-top (neo-brutalist maximalism)
   Brand, neutrals, and status colors come from ui-design-foundations.
   --color-ink is the shared text token, not a second black. */
:root {
    color-scheme: light;

    --color-ink: var(--color-text);

    /* 8px base, extreme range */
    --space-1: 0.5rem; --space-2: 1rem; --space-3: 1.5rem; --space-4: 2rem;
    --space-6: 3rem; --space-8: 4rem; --space-12: 6rem; --space-16: 8rem; --space-24: 12rem;

    /* Type: 1.5 to 1.618 ratio, fluid display */
    --font-display: "Archivo Black", "Anton", Impact, sans-serif;
    --font-body: "Inter", system-ui, sans-serif;
    --font-mono: "Space Mono", ui-monospace, monospace;
    --text-base: 1rem; --text-lg: 1.5rem; --text-xl: 2.25rem; --text-2xl: 3.375rem;
    --text-display: clamp(3rem, 8vw + 1rem, 10rem);
    --leading-body: 1.5; --leading-display: 0.9;

    --radius: 0; --radius-pill: 999px;
    --border: 3px solid var(--color-ink);
    --shadow-hard: 4px 4px 0 var(--color-ink);
    --shadow-hard-lg: 8px 8px 0 var(--color-ink);
    --focus-ring: 3px solid var(--color-focus);
    --focus-offset: 4px;

    --ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1);
    --ease-standard: cubic-bezier(0.2, 0, 0, 1);
    --dur-pop: 240ms; --dur-hero: 800ms;
}

.btn {
    background: var(--color-brand); color: var(--color-on-brand);
    border: var(--border); border-radius: var(--radius); box-shadow: var(--shadow-hard);
    transition: transform var(--dur-pop) var(--ease-pop), box-shadow var(--dur-pop) var(--ease-pop);
}
.btn:active { transform: translate(4px, 4px); box-shadow: 0 0 0 var(--color-ink); }

@media (prefers-reduced-motion: no-preference) {
    @supports (animation-timeline: view()) {
        .reveal { animation: reveal linear both; animation-timeline: view(); animation-range: entry 0% cover 30%; }
        @keyframes reveal { from { opacity: 0; transform: translateY(2rem) rotate(-2deg); } }
    }
}

@media (prefers-reduced-motion: reduce) {
    :root { --dur-pop: 0ms; --dur-hero: 0ms; }
    .marquee { animation: none; }
}
```

`--font-mono` is in the research block. Load it only after Mason signs off on a third family, as the typography section says. The button uses the shared brand fill. Companion fills wait on the TODO below. The native hard-shadow rule is in Components and shape.

TODO (Mason): confirm the lightness steps for companion fills derived from `--color-brand`, or accept a single brand fill. Do not invent the steps.

TODO (Mason): say whether a mono may load as a third family on loud screens, or whether data stays in the body face. Do not invent a third family.

TODO (Mason): add your own words on UI style; do not invent.
