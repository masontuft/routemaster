---
name: ui-design-mobile
description: Use when building or reviewing a phone, tablet, or foldable UI, after ui-design-foundations and a base style, to apply mobile layout, touch, safe-area, platform, and performance rules.
---

# Mobile UI design

Apply `ui-design-foundations` first, then the base `ui-style-*` skill, then this one. This skill owns phone, tablet, and foldable behavior. Mason signs off before an `error` ships, and he can override a `warn` when the screen, the reading, or his judgment calls for it.

When this skill is loaded, it is authoritative for mobile rules. The floors in `ui-design-foundations` still apply. This skill may make a floor stricter. It may not loosen one, and it may not loosen a style skill. Brand and semantic color live in `ui-design-foundations`. This skill does not define hues. A mobile screen may mix styles by section, the way foundations allows, and every section reads that same palette.

These labels match `spirit-of-the-law-linting`. `error` is the letter of the law. `warn` is the spirit of the law.

Headings in UI copy follow `typography-modified-chicago-case`.

Shared floors stay where they are. Contrast, the house target size, reduced motion, Core Web Vitals thresholds, the anti-slop list, and `rem` / `dp` live in `ui-design-foundations`. Type scale, color, radius, and motion duration live in the active `ui-style-*` skill. The native-versus-web table in foundations still decides how a token is expressed. This skill adds the mobile layer on top of that table.

## Layout

- `error`: Lay the screen out from the window the app has now. Android window size classes are the window, and they change when the device rotates, folds, or enters split screen ([Android window size classes](https://developer.android.com/develop/ui/views/layout/use-window-size-classes)). iOS uses regular and compact size classes the same way: functionality stays the same when the class changes, and how much is visible may change ([HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout)).
- `error`: On a compact-height window, use one pane. Android calls two panes impractical there, which covers a phone in landscape ([Android window size classes](https://developer.android.com/develop/ui/views/layout/use-window-size-classes)).
- `warn`: The 320 CSS px reflow floor is in `ui-design-foundations`. On native, also test a compact-width window and a compact-height window.

Column count, grid, and section padding stay in the active style. This skill does not add a second grid.

## Type

The scaling floor is in `ui-design-foundations`, including `allowFontScaling` and where `maxFontSizeMultiplier` is allowed. This section is how the platforms apply that floor.

- `error`: On iOS, support Dynamic Type with the system text styles, up through the larger accessibility sizes. Turn on Larger Text and confirm the screen still reads. As size grows, stack inline items, keep the primary element toward the top, and let labels use as many lines as they need. SF Symbols scale with the text. SF Pro is the iOS system face ([HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)). The style skill still chooses the face when it is not the system face.
- `error`: On Android, specify text in `sp`. `dp` does not follow the font-size setting ([Android grids and units](https://developer.android.com/design/ui/mobile/guides/layout-and-content/grids-and-units)). From Android 14, font scaling goes to 200% on a nonlinear curve, so large text grows more slowly than body text. Test at that maximum. Do not rebuild sizes by multiplying with `Configuration.fontScale`. That field is informational, and the curve is not a single multiplier ([Android 14 font scaling](https://developer.android.com/about/versions/14/features)).
- `warn`: When layout depends on the user's text size, read `PixelRatio.getFontScale()` ([RN PixelRatio](https://reactnative.dev/docs/pixelratio)). Leave the scaling itself to the platform.

## Color

- `error`: Read color from the semantic tokens in `ui-design-foundations` (`--color-bg`, `--color-surface`, `--color-text`, and the rest of that palette). A mobile screen does not introduce a hue, a second neutral, or a mobile-only brand.
- `error`: When the palette has a dark appearance, follow the system. On Apple platforms that is Dark Mode, including Auto while the app is open. An extra in-app appearance toggle fights the system setting ([HIG Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)). On Android, use the dark theme resources rather than light-theme colors left in place ([Android dark theme](https://developer.android.com/develop/ui/views/theming/darktheme)). Whether a dark palette exists at all stays in the style skill.
- `warn`: Test the dark appearance with Increase Contrast and Reduce Transparency, separately and together. Apple warns that dark text on a dark surface can fail once those are on ([HIG Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)). The contrast floors stay in `ui-design-foundations`.
- `warn`: Android documents that dark theme reduces power use by an amount that depends on the screen technology. It does not publish one background hex for every app ([Android dark theme](https://developer.android.com/develop/ui/views/theming/darktheme)). For a large empty region on an OLED panel, `--color-surface-oled` in the token block drops lightness on the shared `--color-bg` and keeps that token's hue and chroma. Text on it still has to pass the foundations contrast floors. Content surfaces keep `--color-surface`.

## Motion

Style durations, springs, and hero motion stay in the active `ui-style-*` skill. Reduced motion, the three-flash limit, and the foundations feedback timing stay in `ui-design-foundations`. This skill does not add a duration scale.

- `error`: Navigation, sheet, and back transitions use the platform transition. On React Native that is the native stack from expo-router, as in the foundations native table. A custom duration on the system back gesture is out.
- `error`: Keep custom gestures off the system back edge and the home-indicator edge. Android's predictive back uses those insets, and a drag target under them fights the system ([Android predictive back](https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back)).
- `warn`: Haptics as a second channel are the `expo-haptics` row in `ui-design-foundations`. They do not replace a visible control.

## Accessibility

The shared accessibility list in `ui-design-foundations` still applies, including contrast, focus, target size, and a visible alternative to dragging. These are the mobile additions.

- `error`: Support both orientations unless a specific orientation is essential ([WCAG 2.2 SC 1.3.4](https://www.w3.org/WAI/WCAG22/Understanding/orientation.html)).
- `error`: A multipoint or path-based gesture has a single-pointer alternative ([WCAG 2.2 SC 2.5.1](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html)). Apple asks for the same thing: a swipe that dismisses also has a button ([HIG Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)).
- `error`: A function triggered by shaking or tilting the device also has a control in the UI ([WCAG 2.2 SC 2.5.4](https://www.w3.org/WAI/WCAG22/Understanding/motion-actuation.html)).
- `error`: Prefer the platform's simple gestures for anything people do often. A custom gesture is discoverable, and it is not the only path ([HIG Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)).
- `warn`: A swipe that deletes asks for confirmation, or it offers a visible undo. People expect that swipe to mean a destructive action, so keep that meaning consistent inside the app ([NN/g contextual swipe](https://www.nngroup.com/articles/contextual-swipe/)).

## Touch targets

The sizes are the house rule in `ui-design-foundations`: 44×44 pt on iOS, 48×48 dp on Android, and 44×44 CSS px on web. This skill does not publish a smaller floor. The web size is also the AAA bar in [WCAG 2.2 SC 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html). Apple states the same 44×44 pt hit region on a button ([HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)).

- `error`: Keep the house target when a toolbar, tab bar, or sticker gets crowded. Move the extra action into the platform's overflow. Do not shrink the target to fit it.
- `warn`: On iOS, leave about 12 pt of padding around a control that has a bezel, and about 24 pt around the visible edges of a control that has none ([HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)). Those are the spacing tokens below. They are iOS guidance, not a second Android target.

## Thumb reach

Steven Hoober's field notes are the source for how people hold phones. There is no single thumb-sweep zone to design into.

In 2013 he recorded 1,333 observations of people with phones. Of those touching the screen: one hand 49%, cradled in two hands while touching with one 36%, two hands 15%. One-handed use was not one pose. Reach charts in that article are approximate and vary by person, grip, and phone size ([Hoober, UXmatters, 2013](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)).

Later passes of the same research: about 75% of people touch with one thumb, fewer than half hold the phone in one hand, about 36% cradle it, and about 10% hold with one hand and tap with a finger of the other. People change grip during a task, and about 41% hold with both thumbs while typing ([Hoober, 2017, part 1](https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php), [part 2](https://www.uxmatters.com/mt/archives/2017/05/design-for-fingers-touch-and-people-part-2.php)).

He has since withdrawn the green-yellow-red thumb chart, including the version he drew. People view and touch the center most quickly and most accurately. His touch-accuracy summary is 7 mm at the center, 9 mm along the edges, and 12 mm in the corners ([Hoober, Designing for Touch](https://www.4ourthmobile.com/publications/designing-for-touch)). The house target in foundations is already stricter than those accuracy figures. Do not shrink a corner control down toward 12 mm.

- `error`: A primary action that only works in a bottom-corner thumb sweep does not ship. Place platform navigation where that platform puts it (the sections below). Place content actions so more than one of Hoober's holds can reach them.
- `warn`: The center of the content is the accurate region. A corner is where touch is least accurate, so a destructive action is a poor thing to leave only there.

## Gestures

- `error`: Standard gestures keep the platform meaning. Tap activates. Swipe scrolls, dismisses, or reveals. The system back control stays available: the Back button in the top toolbar on iOS, and the system back gesture on Android ([HIG Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures), [HIG Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)).
- `error`: An edge-to-edge horizontal scroller does not take the system back swipe. Slop Patterns names that failure "the broken back gesture" ([sloppatterns.com](https://sloppatterns.com/)).
- `error`: A sheet can be swiped away and dismissed with a button. On iOS, Cancel sits on the leading edge of a single-step sheet, Done on the trailing edge when the sheet saves, and a resizable sheet shows a grabber that VoiceOver can use to cycle detents ([HIG Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)). One sheet at a time from the main interface.
- `warn`: If a carousel is actually needed, it supports swipe, shows a strong cue (content cut by the screen edge beats a row of dots), and the last item is a few swipes away. Anything critical in it also exists outside it ([NN/g mobile carousels](https://www.nngroup.com/articles/mobile-carousels/)).

## Safe areas

- `error`: Keep content and controls clear of the notch, the Dynamic Island, the status bar, the home indicator, and the system navigation bar. Apple defines the safe area as the region those do not cover ([HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout)). Slop Patterns calls a layout that ignores them "the rectangular phone" ([sloppatterns.com](https://sloppatterns.com/)).
- `error`: On the web, set `viewport-fit=cover` and pad with `env(safe-area-inset-top)`, `env(safe-area-inset-right)`, `env(safe-area-inset-bottom)`, and `env(safe-area-inset-left)`, each with a `0px` fallback. Without `viewport-fit=cover` the insets stay at zero and the padding never appears ([WebKit, iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/), [MDN `env()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)).
- `error`: On React Native, wrap the app in `SafeAreaProvider` and inset with `SafeAreaView` or `useSafeAreaInsets()` from `react-native-safe-area-context` ([Expo safe areas](https://docs.expo.dev/develop/user-interface/safe-areas/)). Android edge-to-edge draws behind the system bars, so those insets are required there too ([Expo system bars](https://docs.expo.dev/develop/user-interface/system-bars/)).
- `warn`: On Expo web, prefer the CSS variables over a second `SafeAreaProvider`. Expo Router's web path uses the CSS insets so streamed HTML is not thrown away ([Expo safe areas](https://docs.expo.dev/develop/user-interface/safe-areas/)).

Backgrounds may extend under the system bars. Controls and text stop at the inset.

## Platform conventions

Use the platform's bars. A web hamburger that hides four or five sections of a phone app is the slop pattern "hamburger in a native app" ([sloppatterns.com](https://sloppatterns.com/)).

| | iOS | Android |
| --- | --- | --- |
| **Top-level navigation** | A tab bar floats at the bottom. It navigates. It does not hold actions. Include a short label per tab. Avoid a More tab. On iPad the tab bar sits near the top and can become a sidebar ([HIG Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)) | A navigation bar holds three to five destinations at one level, with an icon and a label. On a large window it becomes a navigation rail. A bottom navigation bar on a large window is the wrong pattern ([Android layout and navigation](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns)) |
| **Back** | The standard Back button is on the leading edge of the top toolbar. A swipe from the side is a shortcut beside that button, not a replacement ([HIG Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), [HIG Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)) | Predictive back is the system gesture. Keep the system animation and keep touch targets out of the gesture insets ([Android predictive back](https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back)) |
| **Sheets** | Page or form sheet. Medium and large detents. Grabber when the sheet resizes ([HIG Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)) | A bottom sheet holds secondary content ([Material 3 bottom sheets](https://m3.material.io/components/bottom-sheets/guidelines)). Dragging it has a single-pointer alternative, which the accessibility rules above already require |
| **Type** | SF Pro, Dynamic Type text styles ([HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)) | `sp`, so the system font and the user's font scale both apply ([Android grids and units](https://developer.android.com/design/ui/mobile/guides/layout-and-content/grids-and-units)) |
| **Login** | If the primary account can be created with a third-party social login, also offer an equivalent login that collects only name and email, can hide the email, and does not collect in-app interactions for advertising without consent ([App Store Review Guideline 4.8](https://developer.apple.com/app-store/review/guidelines/)) | The style and the product decide the account system. This row does not add a second brand color for the button |

- `error`: Tab bars navigate between sections. Actions live in a toolbar. Apple separates those two jobs ([HIG Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [HIG Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)).
- `error`: On iOS, a third-party social login for the primary account also offers the equivalent login in guideline 4.8. The exceptions in that guideline (the app's own accounts, a client for one outside service, and the others listed there) still apply.

## Responsive behavior

Android width classes, as published ([Android window size classes](https://developer.android.com/develop/ui/views/layout/use-window-size-classes)):

| Class | Width | What Google maps it to |
| --- | --- | --- |
| Compact | under 600 dp | Almost all phones in portrait |
| Medium | 600 dp up to, not including, 840 dp | Most tablets in portrait, and large unfolded inner displays in portrait |
| Expanded | 840 dp up to, not including, 1200 dp | Most tablets in landscape, and large unfolded inner displays in landscape |
| Large | 1200 dp up to, not including, 1600 dp | Large tablet displays |
| Extra-large | 1600 dp and up | Desktop displays |

Height is separate: compact under 480 dp (almost all phones in landscape), medium from 480 dp up to, not including, 900 dp, expanded at 900 dp and up. The same page says a phone in landscape is often medium width and compact height, which is why two panes fail there.

- `error`: Fold and split-screen can change the class while the app is open. Read the current window. A cached phone-versus-tablet flag goes stale.
- `error`: On a foldable, keep text and controls off a fold whose occlusion is full. Text across that fold can be unreadable ([Android foldables](https://developer.android.com/develop/adaptive-apps/guides/foldables/learn-about-foldables)).
- `warn`: Tabletop posture (half open, hinge horizontal) can put content on one half and controls on the other. Book posture (half open, hinge vertical) can be two pages. Use those when the posture is actually active, and use a single layout when the device is flat ([Android foldables](https://developer.android.com/develop/adaptive-apps/guides/foldables/make-your-app-fold-aware)).

iOS size classes are Apple's compact and regular, not these dp numbers. Use each platform's own buckets.

## Performance

Core Web Vitals thresholds stay in `ui-design-foundations`. This section is how a phone is measured, and how a React Native app starts and scrolls.

- `error`: For a mobile web UI, read the phone form factor in the Chrome UX Report. CrUX splits `phone`, `tablet`, and `desktop`. An all-devices or desktop-only figure does not clear a phone screen ([CrUX dimensions](https://developer.chrome.com/docs/crux/methodology/dimensions)).
- `error`: An Android cold start of 5 seconds or more is the Play vitals "excessive" line, and so are a warm start of 2 seconds and a hot start of 1.5 seconds. Those are time-to-initial-display ([Android launch time](https://developer.android.com/topic/performance/issues/launch-time)).
- `warn`: Android's quality guide aims at a cold start under 500 ms, a warm start under 200 ms, and a hot start under 150 ms ([Android app performance](https://developer.android.com/topic/performance/measuring-performance)). Apple's launch guidance aims at a first frame within 400 ms, with the app interactive then and placeholders allowed for data that is still loading ([WWDC19, session 423](https://developer.apple.com/videos/play/wwdc2019/423/)). Measure a release build on a mid-range device. A React Native app also evaluates its JavaScript bundle before the first screen, so the native aims above can miss. Do not invent a substitute number.
- `warn`: Hermes is the engine to ship. React Native reports better startup, lower memory, and a smaller app for many apps versus JavaScriptCore ([RN Hermes](https://reactnative.dev/docs/hermes)).
- `error`: A long list is virtualized. `FlatList` is the platform list. `FlashList` recycles rows and is the list to reach for when Android scrolling is the problem ([RN FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration), [FlashList](https://shopify.github.io/flash-list/)).
- `warn`: Profile lists in a release build. In the row, use a cropped thumbnail rather than a full asset. When every row has the same height, set `getItemLayout` ([RN FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)). On FlashList, leave `key` off the row and its children so the row can be recycled, and separate very different cells with `getItemType` ([FlashList performance](https://github.com/Shopify/flash-list/blob/main/documentation/docs/fundamentals/performant-components.md)). Request bitmaps at the size you display, using `PixelRatio.getPixelSizeForLayoutSize()` ([RN PixelRatio](https://reactnative.dev/docs/pixelratio)). On Expo, `expo-image` is the image view to use in those rows: it caches, and it decodes through SDWebImage and Glide ([Expo Image](https://docs.expo.dev/versions/latest/sdk/image/)).

TODO (Mason): a kilobyte cap for the JavaScript bundle and for images is not in these sources. Add one if you want it enforced. Do not invent it.

## How each style adapts

Only the mobile delta is here. Color, type scale, radius, shadow, and motion duration stay in the style skill. Every section still reads the foundations palette, including when one screen mixes styles.

### Conservative

The style already maps onto platform defaults. On a phone, use the platform tab bar and toolbar from the table above, the system face that style allows, and solid surfaces.

- `error`: On compact width and on compact height, stay in one column. The style's two-thirds column is for a wider window.
- `warn`: If this screen has a dark palette, the OLED token below is a lightness step of `--color-bg`, not a new gray.

### Futuristic

Glass, the control layer, the blur budget, and the Android solid fallback stay in `ui-style-futuristic`.

- `error`: A floating tab bar or toolbar still clears the safe area and the home indicator. Glass does not cover the Dynamic Island.
- `error`: On a compact window, including a foldable cover, use the style's solid translucent fallback. A cover screen is the low-end case that style already excludes from blur.
- `warn`: Text over glass uses the style's contrast rule. Sample the worst case on the phone, in both appearances.

### Over the top

The single column, the one hero moment, and conservative forms stay in `ui-style-over-the-top`.

- `error`: Horizontal motion stays off the leading edge, so it does not take the system back swipe.
- `error`: The press state that shifts a button by its shadow offset still lands inside the safe area. The control does not slide under the home indicator.
- `error`: A sticker, marquee, or rotated label is not the hit target. The target stays the foundations house size.
- `warn`: On compact height, keep the primary control on screen. Use the tight end of that style's spacing scale for the action row.

## Starter tokens

These are the mobile values. They reference the foundations palette and the house target. They do not redefine either. Spacing of the page, the type scale, and style durations stay in the style skill. Generate the native values from the same source as the CSS, per the foundations table. React Native still cannot parse `oklch()`, so the build writes the derived OLED hex next to the other foundations hex values.

```css
/* Mobile layer: ui-design-mobile. Color comes from ui-design-foundations. */
:root {
    --safe-area-top: env(safe-area-inset-top, 0px);
    --safe-area-right: env(safe-area-inset-right, 0px);
    --safe-area-bottom: env(safe-area-inset-bottom, 0px);
    --safe-area-left: env(safe-area-inset-left, 0px);

    /* House target from ui-design-foundations. 44px on web. Do not lower it. */
    --target-min: 2.75rem;

    /* iOS control spacing from HIG Accessibility. "About" 12pt and 24pt. */
    --space-around-bezel: 12pt;
    --space-around-unbezeled: 24pt;
}

@media (prefers-color-scheme: dark) {
    :root {
        /* Lightness only. Hue and chroma stay on the shared token. */
        --color-surface-oled: oklch(from var(--color-bg) 0 c h);
    }
}
```

```ts
import { Platform } from "react-native";
import { foundationColors } from "./foundation-tokens";

function houseTargetMin(): number {
    if (Platform.OS === "android") {
        return 48;
    }
    return 44;
}

function spaceAroundBezel(): number {
    if (Platform.OS === "ios") {
        return 12;
    }
    return 0;
}

function spaceAroundUnbezeled(): number {
    if (Platform.OS === "ios") {
        return 24;
    }
    return 0;
}

export const mobileTokens = {
    targetMin: houseTargetMin(),
    spaceAroundBezel: spaceAroundBezel(),
    spaceAroundUnbezeled: spaceAroundUnbezeled(),
    color: {
        bg: foundationColors.bg,
        surface: foundationColors.surface,
        text: foundationColors.text,
        surfaceOled: foundationColors.surfaceOled,
    },
} as const;
```

Safe-area insets on native come from `useSafeAreaInsets()`, not from constants. The `./foundation-tokens` import is the project's foundations theme module. This repo does not ship that file. `foundationColors.surfaceOled` is the build output of the CSS derivation above. `spaceAroundBezel` is 0 off iOS because the 12 pt and 24 pt figures are Apple's, and Android's floor is the 48 dp target.

Example. A KOR service row on a phone is one column inside the safe area, a 44 pt row on iOS or a 48 dp row on Android, `--color-text` and `--color-surface` from foundations, and the primary action labeled with the task. It is not a carousel, and it does not invent a rating.

## Avoid AI slop

The letter and the spirit of the anti-slop rules live in `ui-design-foundations`. Apply that list. The tells below are the mobile instances. They do not replace it.

- `error`: Emoji as tab icons is the foundations ban on emoji as chrome, on the tab bar. Slop Patterns names "emoji as icons," and the Fountain Institute names emoji as a navigation item ([sloppatterns.com](https://sloppatterns.com/), [Fountain Institute](https://pages.thefountaininstitute.com/posts/7-tells-that-a-ui-is-ai-generated)).
- `error`: A fake store rating is the foundations ban on invented proof. Slop Patterns shows it as a "4.9 rating" stuck on a hero and as a "4.9/5" stat row ([sloppatterns.com](https://sloppatterns.com/)).
- `error`: A tab bar with six or more tabs, or with Create or Ask AI mixed into the tabs, is Slop Patterns' "crowded tab bar." It also breaks the platform counts above.
- `error`: Shipping a starter tab shell with its sample labels and icons is the foundations ban on an untouched starter theme, on the phone.
- `warn`: NN/g recommends against a deck-of-cards onboarding. It makes a simple app look harder and asks people to memorize the tour. If one still ships, it has a visible Skip, few cards, and one idea per card ([NN/g mobile onboarding](https://www.nngroup.com/articles/mobile-app-onboarding/)). Glossy blobs, isometric cubes, and a floating phone as the art are Slop Patterns' "floating 3D nothing" ([sloppatterns.com](https://sloppatterns.com/)).
- `warn`: A Google-only primary login on iOS, with no equivalent that meets guideline 4.8, is the slop pattern "Google-only sign-in" and the platform rule above.

TODO (Mason): add your own words on UI style; do not invent.
