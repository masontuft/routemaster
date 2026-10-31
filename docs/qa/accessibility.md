# Accessibility

Automated checks do not replace manual testing. Verified by hand in the browser pane on the segment 8a styling pass: no sideways scrolling at 320 CSS px on 13 pages (public, staff and admin), the dark scheme on the staff request page, and the skip link and focus rings by keyboard. Not verified: a screen reader, 200% text zoom, Increase Contrast.

Manual checklist: keyboard-only use, visible focus, form labels, contrast, heading order, clear error messages, small screens.

## Contrast of the enterprise palette

Computed with the WCAG relative-luminance formula after converting each OKLCH token to sRGB (script in the segment 8a pull request description, not committed). Body text needs 4.5:1 and non-text 3:1.

| Pair | Light | Dark |
| --- | --- | --- |
| text on bg | 16.01 | 16.01 |
| text on surface | 14.68 | 11.93 |
| muted on bg | 5.01 | 8.56 |
| muted on surface | 4.59 | 6.38 |
| border on bg (inputs) | 3.22 | 7.17 |
| on-brand on brand (primary button) | 16.01 | 4.63 |
| danger on surface (error summary) | 6.07 | 5.62 |
| success on bg | 6.18 | 7.56 |
| brand on bg (non-text) | 16.01 | 3.46 |

Border on surface is 2.95 in light. It is used only for the header's bottom rule, which is decorative. Inputs sit on the page background.

Links and outlined buttons use the text token, not the brand token, because the dark brand blue is only 3.46:1 against the dark background and would fail as link text.

## Heading case

`src/views/headings.test.js` checks every static heading, button label and legend in the views against modified Chicago case. Headings that contain dynamic values are not checked.
