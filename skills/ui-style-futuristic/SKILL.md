---
name: ui-style-futuristic
description: Use when a project's AGENTS.md or ARCHITECTURE.md selects the futuristic UI style, or when Mason asks for a glass, depth, or motion-forward look.
---

# Futuristic UI style

Layered depth, light, and fluid motion make the product feel advanced. The material serves the content. Apply `ui-design-foundations` first. When this skill is loaded it is authoritative for the rules below. Foundations floors still apply, including the shared palette. This skill may add a rule or make a floor stricter. It does not redefine brand or semantic colors. Mason signs off before an `error` ships, and he can override a `warn` when the content needs it.

Apple's Liquid Glass is the 2025–26 reference. It is "a translucent material that reflects and refracts its surroundings", and controls "fit perfectly concentric with the rounded corners of modern hardware" ([Apple Newsroom, Jun 9 2025](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)). Google's [Material 3 Expressive](https://m3.material.io/blog/building-with-m3-expressive) adds spring physics, shape morphing, and emphasized type. Fluent calls its version Acrylic ([Fluent material](https://fluent2.microsoft.design/material)).

- **Use when:** The KOR marketing site, a product or feature launch, the app shell (tab bar, toolbars, sheets), onboarding, and developer-tool or SaaS aesthetics.
- **Skip this style when:** Long reading, dense tables, low-end Android hardware (blur is expensive), or content with busy photography behind text.
- **Exemplars:** iOS 26 and macOS Tahoe 26 (Liquid Glass), [visionOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos), [Linear](https://linear.app/), [Vercel](https://vercel.com/), [Raycast](https://www.raycast.com/), [Apple.com](https://www.apple.com/) product pages (bento grids), and [Stripe](https://stripe.com/).

## Avoid AI slop

Shared anti-slop floors are in `ui-design-foundations`. This file does not repeat them.

- `warn`: Inter, Geist, or SF Pro are the sans faces this style names. Pick the one the project recorded, and ship the fluid scale in Typography. A third font family, chosen only to look less generated, breaks the two-family cap in `ui-design-foundations`.

## Layout and spacing

- `error`: Use a 4 px base. The token scale matches Conservative, but default gaps run one step larger (airy density). Section padding is 64–128 px on desktop and 48 px on mobile.
- `error`: **Separate a content layer from a control layer.** Glass goes only on floating navigation and controls (tab bars, toolbars, sheets, popovers). Apple's rule is "Don't use Liquid Glass in the content layer" ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)). Content cards use solid or standard materials.
- `warn`: Bento grid sections should have 4–8 tiles, with one anchor tile about 1.5–2× the area of the next largest. Mix content types (demo, stat, quote, list) rather than repeating identical cards ([bento guide](https://brainy.ink/paper/bento-grid-design-guide)). On mobile, collapse to one column in DOM order, anchor first.
- `error`: A bento is a semantic list (`<ul>`/`<li>`) with a heading in each cell. When tiles must be read in sequence or compared row by row, use a table.
- `warn`: Keep corner radii concentric. Inner radius = outer radius − padding. That is Apple's concentric rule.

## Typography

- `error`: Body is at least 16 px and 17 pt, with 1.5 line height. Display type can tighten to 1.0–1.1 line height and −0.02 em letter spacing.
- `warn`: Use a type scale ratio of **1.25 (major third) on mobile, growing to 1.333 (perfect fourth) on desktop** through fluid `clamp()` steps (a [Utopia](https://utopia.fyi/)-style setup). Check ratios on [typescale.com](https://typescale.com/). The `clamp()` values in the starter block are illustrative. Regenerate them for the real breakpoints.
- `warn`: Use one **variable** geometric or grotesk sans (Inter, Geist, SF Pro) plus a mono for code and data. That is the two-family cap from `ui-design-foundations`. Animate `font-weight` or `wdth` only on hover and emphasis moments ([MDN variable fonts guide](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_fonts/Variable_fonts_guide)). Use M3 Expressive's emphasized styles (heavier weight on key actions) to steer attention ([M3 Expressive](https://m3.material.io/blog/building-with-m3-expressive)).

## Color

- `warn`: Design dark first and offer light too. Background, surface, text, brand, and accent are the foundations tokens. This style does not define a second palette. The hero gradient runs from `--color-brand` to `--color-accent`. Text on those fills uses `--color-on-brand` and `--color-on-accent`.
- `warn`: A P3 boost of the brand, when the project has one, lives on `--color-brand` in `ui-design-foundations`. This style does not add one.
- `warn`: Gradients interpolate in Oklab: `linear-gradient(in oklab, …)` avoids the muddy gray middle ([Evil Martians](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)). `--gradient-hero` is that gradient, and it has one job. Text uses a solid foundations color.
- `error`: **Text over glass must pass 4.5:1 against the worst-case background behind it.** Sample the worst case. An average of that background is the wrong check. Use heavy blur, at least 20 px and preferably more. NN/g says "more blur is better" over photos, video, and animation ([NN/g glassmorphism](https://www.nngroup.com/articles/glassmorphism/)). Over bright media, add a dimming layer. Apple suggests 35% dark dimming behind clear glass on bright content ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)).
- `error`: Honor reduced transparency. On web, `@media (prefers-reduced-transparency: reduce)` swaps glass for solid surfaces. It has limited browser support ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency)), so also treat `prefers-contrast: more` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast)) as a reason to go solid. On iOS, `AccessibilityInfo.isReduceTransparencyEnabled()` ([RN AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo)) does the same job.

## Components and shape

- `warn`: Radius is 12 px on controls, 20 px on cards, and 28 px on sheets, with pills for primary capsule buttons. M3 Expressive suggests mixing round and square shapes to create tension, and breaking from the surrounding shape style to draw attention ([M3 Expressive](https://m3.material.io/blog/building-with-m3-expressive)). One radius on every element is the shared anti-slop warning. These four tokens are the decision.
- `warn`: Show depth with translucency, a 1 px inner highlight border (`oklch(1 0 0 / 0.1)`), and large soft shadows. Limit glass to the few most important controls. Apple: "Use Liquid Glass effects sparingly" ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)).
- `error`: Interactive borders and input outlines use `--color-border` and still hit 3:1. Decorative hairlines are exempt.
- `error`: Keep navigation predictable. Controls do not appear, vanish, or reflow based on context unless that change is essential. NN/g's iOS 26 review faults collapsing tab bars, an unlabeled back button, and crowded, smaller tap targets ([NN/g, Oct 2025](https://www.nngroup.com/articles/liquid-glass/)).

## Motion

- `warn`: Use durations from 150–400 ms. Enter takes slightly longer than exit (for example 300 ms in, 200 ms out), per [NN/g](https://www.nngroup.com/articles/animation-duration/). Use M3 emphasized decelerate `cubic-bezier(0.05, 0.7, 0.1, 1)` for entering and emphasized accelerate `cubic-bezier(0.3, 0, 0.8, 0.15)` for exiting ([M3 tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)). On native, prefer **springs**, and use Reanimated shared-element transitions. M3 Expressive moved components to a spring-based motion physics system, and the easing and duration tokens are no longer maintained for components.
- `warn`: Use shared-element and route transitions with the View Transitions API. Same-document `document.startViewTransition()` is Baseline 2025 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition)). Cross-document `@view-transition` has limited availability ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@view-transition)), so treat it as progressive enhancement.
- `warn`: Scroll-linked reveals use CSS scroll-driven animations, which can run off the main thread ([Chrome for Developers](https://developer.chrome.com/docs/css-ui/scroll-driven-animations)). `animation-timeline` has limited availability ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline)), so wrap it in `@supports (animation-timeline: view())`, and make content fully visible without it.
- `error`: Use `@starting-style` for entry animations of dialogs and popovers ([MDN, Baseline 2024](https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style)) rather than JS timers.
- `error`: Under reduced motion, replace springs, slides, and parallax with a crossfade of 150 ms or less, or with nothing. Leave controls the user did not touch unanimated. NN/g calls iOS 26's shimmering, wiggling controls "motion without meaning."

## Imagery and icons

- `warn`: Use 3D renders, device mockups, and soft-lit product shots. Icons are filled or duotone, and can animate on state change (like SF Symbols animations). Serve imagery as AVIF or WebP with explicit `width` and `height` (CLS).
- `warn`: Put glows and gradient meshes on decorative layers with `aria-hidden` and `pointer-events: none`. They still need a token and a reason from `ui-design-foundations`. A mesh with no token does not ship.

## Performance

- `error`: Use at most **3 simultaneous `backdrop-filter` surfaces** on screen, and never animate the blur radius. `backdrop-filter` is Baseline 2024 ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)) but costs GPU on every frame that content scrolls under it.
- `warn`: On RN Android, prefer a solid translucent fill over `BlurView`. Blur is costly and inconsistent there. `expo-glass-effect`'s `GlassView` is iOS 26+ only and falls back to a plain `View` elsewhere. Check `isGlassEffectAPIAvailable()` before rendering it. Use `expo-blur` where `GlassView` is unavailable ([Expo GlassEffect](https://docs.expo.dev/versions/latest/sdk/glass-effect/), [Expo BlurView](https://docs.expo.dev/versions/latest/sdk/blur-view/)). Decorative motion stays on `ReduceMotion.System` from `ui-design-foundations`.

## Pitfalls

- Glass over busy content. NN/g's main complaint about iOS 26: "anything placed on top of something else becomes harder to see" ([NN/g](https://www.nngroup.com/articles/liquid-glass/)).
- Glass on content cards. That is the content layer, so use standard materials or solid surfaces.
- Low-contrast dark-mode gray on gray that fails 4.5:1.
- Bento for its own sake. Six identical title-plus-paragraph tiles in different sizes reads as a bug.
- Setting `opacity < 1` on a native `GlassView` or its parent. The effect stops rendering ([Expo docs](https://docs.expo.dev/versions/latest/sdk/glass-effect/)).

## Starter tokens

```css
/* Futuristic: ui-style-futuristic (dark-first)
   Brand, accent, neutrals, and status colors come from ui-design-foundations.
   This block does not set hues. */
:root {
    color-scheme: dark light;

    --color-glass: oklch(from var(--color-surface) l c h / 0.72);
    --color-glass-highlight: oklch(1 0 0 / 0.10);
    --gradient-hero: linear-gradient(in oklab 135deg, var(--color-brand), var(--color-accent));

    --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem;
    --space-5: 1.5rem; --space-6: 2rem; --space-8: 3rem; --space-10: 4rem; --space-12: 6rem; --space-16: 8rem;

    /* Fluid type: 1.25 at 360px viewport to 1.333 at 1440px */
    --font-sans: "Inter", "Geist", system-ui, sans-serif;
    --font-mono: "Geist Mono", ui-monospace, monospace;
    --text-base: clamp(1rem, 0.96rem + 0.19vw, 1.125rem);
    --text-lg: clamp(1.25rem, 1.18rem + 0.32vw, 1.5rem);
    --text-xl: clamp(1.563rem, 1.44rem + 0.55vw, 2rem);
    --text-2xl: clamp(1.953rem, 1.75rem + 0.9vw, 2.665rem);
    --text-display: clamp(2.441rem, 2.08rem + 1.6vw, 3.553rem);
    --leading-body: 1.5; --leading-display: 1.05; --tracking-display: -0.02em;

    --radius-control: 12px; --radius-card: 20px; --radius-sheet: 28px; --radius-pill: 999px;
    --blur-glass: 24px;
    --shadow-float: 0 8px 32px oklch(0 0 0 / 0.35);
    --focus-ring: 2px solid var(--color-focus);
    --focus-offset: 3px;

    /* Motion (M3 emphasized) */
    --ease-enter: cubic-bezier(0.05, 0.7, 0.1, 1);
    --ease-exit: cubic-bezier(0.3, 0, 0.8, 0.15);
    --ease-standard: cubic-bezier(0.2, 0, 0, 1);
    --dur-short: 150ms; --dur-medium: 300ms; --dur-exit: 200ms; --dur-long: 400ms;
}

.glass {
    background: var(--color-glass);
    backdrop-filter: blur(var(--blur-glass)) saturate(1.4);
    border: 1px solid var(--color-glass-highlight);
}

@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
    .glass { background: var(--color-surface); backdrop-filter: none; }
}

@media (prefers-reduced-motion: reduce) {
    :root { --dur-short: 0ms; --dur-medium: 120ms; --dur-exit: 0ms; --dur-long: 120ms; }
    ::view-transition-group(*) { animation-duration: 0s; }
}
```

A fixed lightness of 0.72 and 0.82 on these brand hues fails 4.5:1, both as white text on that fill and as text on white. It would also replace `--color-accent`. The gradient uses the palette's brand and accent instead. Text on a fill uses the palette's `--color-on-brand` or `--color-on-accent`. The native glass rule is in Performance.

TODO (Mason): add your own words on UI style; do not invent.
