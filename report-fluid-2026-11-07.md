# Fluid layout for large screens (2026-11-07)

Branch `fluid-layout-2026-11-07` (from `main`). Not merged, not on production. Only CSS (`assets/css/styles.css`) and one line in `assets/js/main.js` changed. No HTML, copy, legal text, forms or functions touched.

## Problem
The content was held at a fixed 1240 px shell on every screen. At 2560 px wide the page used less than half the width, text and the hero graphic stayed phone-sized.

## What changed
- **Root font size scales with the screen** (no CSS `zoom`, no `transform: scale`; browser zoom and user font settings still work):

  | viewport | root size | px per 1rem |
  |---|---|---|
  | < 1600 | 100% | 16 |
  | >= 1600 | 112.5% | 18 |
  | >= 1920 | 125% | 20 |
  | >= 2560 | 137.5% | 22 |
  | >= 3440 | 150% | 24 |
  | >= 3840 | 162.5% | 26 |

  Steps follow your suggestion, with one extra step at 3840 (4K). Phones and laptops (< 1600) are unchanged: 1rem stays 16 px.
- **Wide container**: `--shell: clamp(77.5rem, 90vw, 100rem)`. Floor is the old 1240 px (so laptops at 1280 look the same), 90 vw in between, cap grows with the root size (1800 px at 1920, 2200 at 2560, 2400 at 3440, 2600 at 3840). `.shell--wide` and `.shell--narrow` got the same treatment (rem based).
- **Everything fixed in px that is visible** moved to rem so it grows with the root size: brand mark, burger, nav drawer width, stage graphic offsets (pointer parallax, fan distances, drift), ruled grid, CTA plates, icons, step/row columns, eyebrow marks, checkbox, radii. 1 px hairlines stay 1 px on purpose.
- **Hero graphic**: it already scaled with its column; the column is now wider, and the pinned track is `min(165vh, 85rem)` instead of `min(165vh, 1360px)`.
- **JS**: `main.js` keeps the graphic at least 96 px below the top so it does not slide under the header. That minimum is now multiplied by the root-size factor. Everything else in the script measures real geometry and needed no change.
- Body text measures stay in `ch` (46 to 76 ch), so line length stays readable at every size. Feature-row paragraphs got a 64ch cap.
- Brand tagline under the logo (the smallest text on the site, 7.5 px at 320 px) raised from 0.535rem to 0.6rem (0.47 to 0.56rem on phones).
- Cards, tiers and breakpoints for the mobile menu (1100 px), single column (1080 px) and phone (620 px) are unchanged.

## Checks (Playwright, Chrome)
Viewports 320x640, 360x740, 390x844, 768x1024, 1024x768, 1280x800, 1440x900, 1920x1080, 2560x1440, 3440x1440, 3840x2160 on all 8 pages (incl. 404): **0 horizontal scrolls, 0 console errors**. Smallest text at 320 px is now 9 px (the brand tagline, was 7.5 px), at 2560 px 12.7 px.

Screenshots: full-page PNGs per page and width in the scratchpad of this session
`C:\Users\maand\AppData\Local\Temp\claude\12e4a68bd1731b5e\4e2451ff-195b-459e-b141-9e7fe1c91a30\scratchpad\fluid\au-b\<page>-<width>.png`, metrics in `...\au-b\metrics.json`.
Contact sheet (all pages x all sizes): `fluid-contact-sheet.png` in the repo root, so it is also visible on the preview. **Delete it before merging.**

## Preview
See the end of this file (filled in after deploy).

## Not fixed / notes
- Hero: the pinned graphic track still leaves a tall empty-looking stretch below the copy on very tall screens. That is the scroll-scrub design (graphic stays parked while the copy scrolls) and was already like that; I did not redesign it.
- "How I work" steps and the "Why" rows leave the right part of the container quiet at 2560+. Text is capped for readability; filling it would need a layout redesign.
- Screenshots of the contact sheet are scaled down; judge detail on the live preview.
