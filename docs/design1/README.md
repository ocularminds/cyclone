# Calm Precision implementation evidence

Implemented on 10 November 2026 in the existing IWSDK application. The repository's default branch is `main`;
there is no local or remote `master`. Fetch/fast-forward synchronization found `481fa6d` already current.
The requested Markdown design brief was absent, so the supplied `brief.design1.pdf` was read alongside the
design guide, brand kit, technical review and shared contracts. The owner's reference files, D33/D34 edits
and deletion of the old submission brief are preserved outside this implementation commit.

This is application evidence. The HTML brand studio is a reference, and no studio screenshot is used as
proof of XR behavior. Technical R1's authoritative signed-action association/recovery is still separate work;
the interface treats missing binding coverage as unverified. No live or physical machine test is claimed.

## What changed

- **Settings:** the inherited 80 cm button minimum is removed. A paged 28×26 cm UIKit panel has 3.5 cm targets,
  persistent Back/Close, accurate input names, preferred hand, themes, contrast, text size, captions, reduced
  motion, passthrough, restart, amendment mode, live availability, rule revocation and deliberate reset.
- **Reading and controls:** opaque Ink/Porcelain/high-contrast surfaces, local Manrope and Atkinson fonts,
  tabular values, named rationale/amend/compare controls, measured pagination and separate caption rows.
  The card stays in the desk frame after opening. Detail controls yield to nearby physical grabs. Critical
  reading surfaces draw above the miniature so the ledger shelf cannot cover instructions.
- **Physical loop:** the same pull, twist, place, hold, push and escalate mechanics remain. Tracking loss cannot
  finish a hold; release, edit and pause cancel it. A completed escalation releases focus for the next token.
  Reduced motion removes decorative movement while retaining explicit hold timing.
- **Receipt and comparison:** original and reviewed evidence share a model/start state, patterned paths and
  one active ghost. Signed demo receipts retain values, geometry, samples, poses, breaches and versions.
  Reload and later model changes do not rewrite history. Legacy history and invalid signatures are explicit.
  Crystals now have 40 mm centers to prevent selecting a neighboring record.
- **State and identity:** onboarding completion is independent of visits, so unfinished work resumes.
  Timeouts count as drill misses; unresolved escalation is unassessed; false alarms stay separate. Demo rules
  require an actual offer, bounded scope, expiry and revocation. Only the Stillpoint entry assets, required
  fonts and semantic tokens are copied from the kit. The procedural miniature and hash glyph remain distinct.

## Runtime geometry and typography

| Surface | Mounted measurements | Evidence |
|---|---|---|
| Baseline settings | 22×23.98 cm panel, inherited 80×2.6 cm button | [baseline bounds](before-settings-bounds.json) |
| Current settings | 28×26 cm panel; actions 25.6×3.5 cm; Back/Close about 12.32×3.5 cm | [23 page snapshots](settings-bounds.json) |
| Review card | 28×24.5 cm overall at 56.5 cm; measured farthest corner 59.484 cm; extents 14.009° H / 13.514° V | [card bounds](card-bounds.json) |
| Receipt detail | Same overall dimensions; body, caption and buttons measured at 100%/125% | [receipt bounds](receipt-bounds.json) |
| Physical targets | Actual farthest vertex 60.8002 cm (chute); ledger 60.1227 cm, dial 54.3003 cm, timeline 50.9088 cm | [physical bounds](spatial-bounds.json) |

Settings pages are checked for clipping, containment, reach and FoV using mounted UIKit sizes and world-space
positions. Card/receipt checks use actual mesh corners and button bounds; captions do not overlap text or hit
targets. The summary keeps all event counts at both sizes. These are emulator measurements, not headset
legibility certification. Physical controls receive a separate actual-vertex audit in `spatial-bounds.json`.

[Typography implementation](fonts.md) records the TTF/atlas route, tabular derivative and OFL notices.
[Loaded label evidence](font-and-labels.json) includes family, weight, text size and font readiness.
Semantic text pairings meet 4.5:1 and focus/boundary pairings 3:1 in the automated sRGB checks. The local
system fallback occupies the same fixed bounds until the bundled fonts load; it does not delay the first task.

## Verification

The baseline had 50 passing app tests and 46 relay tests. The changed app passes 68 tests, including invalid
values, concurrent amendment/duplicate decisions, hold cancellation and tracking interruption, retained
history/tampering, settings/reset, onboarding resume, rule scope/expiry/revocation, placement and contrast.
The relay remains unchanged and its typecheck plus all 46 tests pass.

| Check | Result / evidence |
|---|---|
| App typecheck and unit tests | Passed; 68 tests in seven files |
| Hands-only first shift | 27/27; [onboarding run](e2e-onboarding.json) |
| Alternative input and rules | 14/14; [extra run](e2e-extras.json), including disconnect cancellation, one-hand hold, gaze-pinch, push, escalation and actual Revoke control |
| Settings and rationale | 118/118; [UI run](e2e-design-ui.json), all pages at 100%/125%, input choices, return to task and reset cancellation/confirmation |
| Final review page | [final review](e2e-final-review.json): head turn leaves the card in place; full rationale remains readable across pages; all visible labels fit with loaded fonts |
| Historical receipts | 24/24; [receipt run](e2e-receipts.json): physical pickup and controls; model/legacy/tamper records are explicit test fixtures |
| Reading surface visibility | 10/10; [actual stereo draw callbacks and hand input](occlusion.json): card, settings and receipt draw after miniature colour in each eye; settings selection, Close, physical place and receipt pickup still work |
| Physical control geometry | 6/6; [actual meshes](spatial-bounds.json), loaded/scaled values and offered-rule copy at 100%/125% |
| Capture and end card | 6/6; [capture run](e2e-capture.json): deterministic hash, empty tray, even seal row, idle machines and hidden HUD |
| Production subpath | 11/11; [production check](production.json) records the clean browser context, local assets, backend block and four-decision data flow |
| Rendering budget | `performance.json` and [performance log](../perf.md); desktop emulator only |

[Build identifiers](build.json) include dependency/runtime versions and the production asset hash. The build
passes with the existing large-chunk/upstream annotation warnings; relative inline font URLs are checked at runtime.

Production Chromium is 156.0.8078.4. With every remote request blocked, all four actions and local signatures still
completed, but the SDK reported its unavailable room capture ([strict-block evidence](production-all-remote-blocked.json)).
The clean-load check permits only the observed static room JSON and two input-model GLBs from the SDK's CDNs;
all service traffic remains blocked. It then has no failed requests or page errors. Fonts, UI and identity
assets are served under `/cyclone/`, and all ten rendered numeral widths are equal.

The first token arrived at 6.0 seconds and the first seal at 25.4 seconds. The automated shift reached its
summary at 179 seconds; tool-driven pacing does not establish the intended human-paced five-minute duration.
Controllers were never used by the immersive test scripts. A scripted browser data-flow test is identified
separately from the physical hand-input tests.

Run the managed server from `app/`, then the scripts listed in the root README. Set
`CYCLONE_EVIDENCE=../docs/design1` to write evidence here. Run `receipts.mjs` directly after `drive.mjs` so it
can reuse the four signed records. Other scripts reset their own test state. `production.mjs` expects a built
site served at `http://127.0.0.1:4177/cyclone/` and uses a separate browser context.

## Images and remaining dependencies

The before images are `before-card.png`, `before-settings.png` and `before-ledger.png`, taken from commit
`481fa6d`. After images come from the application in an active immersive session. The final
[comparison](ui-runtime-review.jpg) shows the baseline and corrected card/settings home; current full frames
are `after-card.png`, `after-settings.png` and the three `after-settings-125*` captures. The corrected receipt
is `after-receipt-unoccluded.png`. The bounded review confirms that the reading surfaces are inside the frame,
have opaque contrasting surfaces and are no longer hidden by the shelf. Device legibility remains H3.

The first contact sheet found shelf occlusion that numeric panel bounds did not catch. Its diagnostic image
is retained as `review-before-depth-fix.jpg`; the final sheet is the one permitted replacement after that
focused correction. Other progress images document the earlier interaction runs. They are not a second
claim of final visual inspection. Actual post-correction draw order is recorded per eye in `occlusion.json`.

- **H3:** `adb devices` found no attached Quest ([device evidence](device.json)). Sustained headset frame timing,
  VR Glasses FoV crop, real tracking, two-room anchoring and real desk edges remain required.
- **R1 / H1:** authoritative live proof binding, provisioned policy/credentials, genuine signed service records
  and supported live acceptance remain open. Local demo signatures are not official attestations.
- **C13:** the previously documented upstream verifier CLI corpus failure remains unresolved (D20d).
  Browser/reference parity passes; that does not turn the separate CLI failure into a pass.
- **H4 / H6 / H2:** headset video, launch-date confirmation and human competition submission remain open.
- **C50:** optional public-CLI demo proof-bundle export is outside this design implementation and remains todo.

The complete 50-row status register remains in [CAPABILITIES.md](../../CAPABILITIES.md): **32 verified,
16 partial, one blocked and one todo**. No capability was removed or marked device-verified from emulator
evidence. Decisions D35–D45 record the implementation choices.
