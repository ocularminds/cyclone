# Design-kit validation

Checked on 10 November 2026. These checks apply to the design kit, not to the Cyclone application.

## Colour

All 39 specified foreground/background pairings passed their threshold using the WCAG 2 sRGB relative-luminance calculation. Normal/semantic text uses 4.5:1; boundaries use 3:1. Pair values and results are in `contrast-report.json`. Surfaces are assumed opaque. This is not a whole-product accessibility certification.

## Interactive specimen

Observed passing in the browser:

1. A 250-to-180 amendment updates the number and illustrated result.
2. Out-of-range numeric input shows an error and prevents the practice hold.
3. Named increase/decrease controls change the value by five.
4. Releasing a keyboard hold early cancels it.
5. A continuous 1.5-second keyboard hold records a practice decision.
6. A practice decision does not change “Verification: not performed.”
7. Editing the value clears the prior practice decision.
8. Moving the pointer outside the hold control cancels the active hold.
9. Moving keyboard focus cancels the active hold.
10. A negative delegation bound is rejected.
11. An allowed 0-to-5-percent example can be saved locally in the preview.
12. Revocation updates the example and disables repeat revocation.
13. The high-contrast theme and preference switch agree.
14. The 125% panel-text control changes the specimen typography.
15. Reduced motion removes the preview's movement effects.
16. Caption preference shows/hides the example caption.

The actual XR hand/gaze hardware, policy enforcement, proof verifier and application storage were not exercised by this kit. Browser interactions are labelled as practice/examples. They use no network calls or persistent storage.

## Layout and exports

- Desktop studio inspected at 1440 px wide.
- Enlarged-text high-contrast specimen inspected at 390 px wide.
- No document overflow at 320 px wide with enlarged panel text; the comparison reflows vertically. The typography reference table has its own horizontal scroll area.
- The studio loads from a local `file:` URL with all images and the UI font available; local control editing works.
- Ink, Porcelain and High Contrast specimens visually inspected.
- All nine PDF pages rendered and visually reviewed. Unsupported decorative font glyphs were replaced with vector geometry; the final PDF text contains no unsupported non-ASCII glyphs in its UI font.
- SVG logos use outlined lettering; SVG/PNG exports include transparent and reversed options.
- The kit includes the original font licences and the Three.js MIT notice.

Outstanding application validation: headset x-height/readability, actual eye/head gaze support, reach, hand occlusion, room/table fit, tracking-loss recovery, full first-shift completion and sustained device performance. The design dimensions are starting points for that work.
