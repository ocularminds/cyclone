# Codex implementation instructions: design

Date: 10 November 2026  
Repository: `/Users/bonus/develop/products/Cyclone`  
Target: the existing Cyclone WebXR application in `app/`.

When asked to execute this guide, implement the Calm Precision design system in the application, verify its real interactions, and produce reviewable evidence. Preserve the existing inspect, rehearse, amend, decide and seal workflow. The browser studio is a reference specimen; improving that specimen alone does not implement this task.

## 1. Required references

Read these before editing:

| Reference | Purpose |
|---|---|
| [brief.design1.pdf](/Users/bonus/develop/products/Cyclone/brief.design1.pdf) | Primary visual specification: identity p.2, palette p.3, typography p.4, controls p.5, forms p.6, access/geometry p.7, evidence language p.8, handoff p.9. |
| [brief.revision1.pdf](/Users/bonus/develop/products/Cyclone/brief.revision1.pdf) | Technical/competition review: experience gaps G01-G06 p.4; integrity findings G07-G11 p.5; open capabilities p.6; feature priorities p.7; acceptance evidence p.8. |
| [instruct.revision1.md](/Users/bonus/develop/products/Cyclone/instruct.revision1.md) | Technical implementation work, shared contracts and dependencies. |
| [design guide](/Users/bonus/develop/products/Cyclone/design/brand1/GUIDE.md) | Detailed component, access, state and implementation rules. |
| [design tokens](/Users/bonus/develop/products/Cyclone/design/brand1/tokens.json) | Exact semantic colours, type roles, spacing, timing and proposed XR dimensions. |
| [design studio](/Users/bonus/develop/products/Cyclone/design/brand1/index.html) | Interactive reference for controls, themes, cancellation and form states. |

`brief.revision1.pdf` is an identical reference copy of `brief.review1.pdf`, not a new assessment. The PDFs and the studio describe a proposal and a review baseline, not completed application work.

Read root `AGENTS.md`, `brief.submission.v2.md`, `CAPABILITIES.md`, `DECISIONS.md`, and the scoped instructions for every edited directory. Paths below are relative to the repository root. Invoke the project's `app/.agents/skills/iwsdk-dev/SKILL.md` when executing application work; follow its routing to `iwsdk-ui`, interaction, model, composition and testing specialists as applicable. Discover installed APIs instead of guessing them.

## 2. Scope and operating rules

- Work in the existing IWSDK 1.0.1 / TypeScript / ECS application. Keep its four scenarios and all registered capabilities.
- Inspect the current diff first. Preserve unrelated changes, including an existing deletion of `brief.submission.md` if it is still present. Do not reset files, restore deleted work or stage someone else's edits.
- Keep the demo static, immediately usable and independent of credentials or a live service. Do not introduce a login, remote font dependency or onboarding delay to apply the identity.
- Import runtime Three.js APIs from `@iwsdk/core`. The brand kit's `source/` and its standalone Three.js vendor files are artwork authoring resources; do not import them into the application.
- Use `iwsdk.config.json`, manifests and the managed development workflow. Do not rebuild the project or introduce another rendering framework.
- Keep brand assets in `design/brand1/` as references. Copy only the production assets actually needed into the app's asset pipeline, preserving font licences and resolving URLs against the configured base path.
- Human instructions and established policy requirements take precedence over a mockup. Log interpretations and any conflict with older copy in `DECISIONS.md`. Never preserve a reproduced defect merely to match an old claim.
- Update capability evidence only after the relevant check passes. Do not mark device-dependent work complete from a flat screenshot or the HTML specimen.

## 3. Coordinate with the technical guide

| Ownership | Design responsibility | Technical dependency |
|---|---|---|
| G01 settings geometry | Own D1 below, including actual runtime bounds. | Technical R0/R4 consume its verified result. |
| G02 onboarding | Add resume/restart and first-shift affordances. | R4 owns persisted completion and routing. |
| G03/G04 access and reach | Accurate labels, usable alternatives, readable placement. | R4 owns true input support and placement/bounds logic. |
| G07/G08 verification | Present the backend's states conservatively. | R1 owns binding checks, authorization/proof state and execution gating. |
| G09 history | Design receipt detail and historical replay affordances. | R2 owns immutable data, migration and replay semantics. |
| G10/G11 scoring/delegation | Show corrected outcomes and bounded rule controls. | R3 owns scoring, matching, expiry and revocation. |

If both guides are being executed, use this sequence: technical R0 baseline; design D1 settings repair; technical R1-R3 contracts/correctness; design D2-D6; technical R4-R6 and design D7 joint verification. Colours and typography can be prepared while a contract is being resolved. Do not invent a local “verified” flag or fake a completed integration to unblock a screen.

## 4. Implementation phases

### D0. Establish the baseline

Inspect `app/src/app.ts`, `app/src/stage.ts`, `app/src/assets.ts`, `app/src/ui/label.ts`, `app/src/models/palette.ts`, `app/src/models/layout.ts`, and the card, settings, gesture, seal and HUD systems.

Run the existing typecheck and tests before browser work. Record the current commit, relevant changed files and known failures. Capture the actual runtime card/settings/ledger before editing so the final comparison reflects the same scenario and state.

### D1. Repair settings geometry before restyling — G01

Primary files: `app/public/ui/settings.uikitml`, `app/src/systems/settings.ts`, `app/src/state/settings.ts`.

The review measured 80 cm buttons inside a 22 cm panel despite an authored 9.6 cm width. Inspect the mounted components' computed width, minimum size, intrinsic label size and inherited prefab constraints. Correct the constraint that wins at runtime; a stylesheet edit alone is not evidence of a fix.

Use a short paged layout with persistent Back and Close controls:

- Input: Hands, Gaze + pinch, One hand; preferred hand where applicable.
- Display/Comfort: text size, contrast, captions and reduced motion, split further if scaled controls do not fit.
- Session: replay first shift, passthrough/fallback controls and deliberate reset.
- Retain the existing amendment-mode and demo/live capability information in a clearly named advanced/status area. Do not silently remove existing settings or advertise unavailable live functionality.

UIKit sizes are centimetres, not CSS pixels. Start with a maximum 28 × 26 cm panel, 1.2 cm padding, 0.8 cm gaps and 3.5 cm preferred targets, never below 3.2 cm. Reflow or paginate rather than shrinking critical text. These dimensions are starting points, subject to actual reach and field-of-view checks.

Acceptance: inspect computed bounds after mounting; every visible control and its hit target stays inside the panel; no clipped labels or displaced second column; all settings, Back, Close, reset cancellation and return to the task work through supported hand/gaze interaction. Repeat at 125% text size. Reset must explain its scope and require a deliberate confirmation.

### D2. Introduce semantic colour and typography

Primary files: `app/src/models/palette.ts`, `app/src/ui/label.ts`, UI panels and asset registration.

- Implement semantic roles from `design/brand1/tokens.json`, including Porcelain, Ink and High Contrast. Map roles across canvas labels, UIKit panels and 3D materials; avoid scattered new hex constants.
- Preserve risk labels, shape and hatching. Routine/circle, review/triangle, high attention/diamond and blocked/locked square must remain distinguishable in greyscale. Policy requirements determine available actions, independently of colour.
- Use opaque text surfaces. Check actual rendered text, boundaries, disabled reasons and focus cues; lit materials and transparent backgrounds can invalidate a swatch contrast result.
- Use Manrope 600-700 for identity/display and Atkinson Hyperlegible Next 400-700 for task UI and values. The files and OFL notices are in `design/brand1/fonts/`.
- Verify the installed renderer's font/atlas mechanism. Do not assume it accepts a TTF or browser CSS directly. Register/load local resources through supported paths, wait for usable font metrics, and test the actual production subpath build.
- Keep units beside values and numerals tabular. Start at 0.9 cm body em, 1.0 cm labels, 1.5 cm titles and 1.8 cm metrics; supporting 0.75 cm text must not be the only source of a critical instruction.
- Avoid layout jumps or a blank first task while fonts load. Record a renderer limitation and a verified fallback if necessary instead of claiming the intended font is installed.

Acceptance: all specified role pairings meet the kit's contrast targets on their intended opaque surfaces; glyphs, degree signs, labels and values render without missing characters; the first token still arrives within the existing timing target; 125% text reflows without reach/FoV overflow.

### D3. Make the decision card and controls legible — G06

Primary files: `app/src/systems/card.ts`, `app/src/systems/ghost.ts`, `app/src/systems/gesture.ts`, `app/src/systems/hud.ts`, relevant models and labels.

Order the information: asset and agent; action/change; original and proposed value with units; current rehearsal consequence; rule/affected assets; required gesture; expiry and source. Keep one-line rationale visible and provide a named full-rationale disclosure. Preserve the action's hash-derived glyph.

Keep the existing physical language: look/inspect, pinch-pull timeline, twist dial, place, two-hand hold or supported one-hand equivalent, veto at the edge, escalate, and pick up a seal. Form controls support those mechanics; a generic desktop approval button does not replace them.

Implement default, target/focus, pressed, busy, unavailable-with-reason, error and completion states. Numeric inputs use the selected scenario's real bounds, units and step. Reject non-finite/out-of-range values while preserving visible input and the last valid rehearsal. Editing an action cancels an active commitment. Scrubbing is preview-only.

Acceptance: an unfamiliar user can identify what changes, which asset is affected, why review is needed, what the rehearsal shows and how to stop. Detail controls work without stealing a pinch intended for a token. Duplicate activation during busy state does not emit another decision.

### D4. Implement access and comfort consistently — G02/G03/G04

Primary files: settings/state, `app/src/systems/gesture.ts`, `app/src/systems/card.ts`, `app/src/systems/audio.ts`, `app/src/audio/synth.ts`, `app/src/models/layout.ts`.

- Call the pinch-dependent path “Gaze + pinch.” Identify head-directed versus actual eye-gaze support accurately; do not promise eyes-only interaction.
- Dwell may inspect, never approve, accept a rule or reset data. Keep one-hand plus sustained-gaze confirmation equivalent to the required deliberate hold.
- Make progress and cancellation visible. Intentional release cancels. Tracking interruption stops progress; a retained short dropout tolerance must not let a decision complete while required input is missing. Cancellation requires a fresh start.
- Captions begin on and cover every meaningful audio cue. Keep the important instruction on the card after transient feedback fades.
- Reduced motion removes bloom, pulsing, recoil and unnecessary easing, retaining immediate state changes and explicit timing.
- Use R4's onboarding-completion state for resume/restart. Opening a settings panel or refreshing must not incorrectly graduate a user into handover.
- Validate the dynamic card, dial, timeline, ledger and every settings page against the actual seated head and table. Preserve the intentional card offset that avoids hand occlusion; do not introduce a permanently head-locked wall.

Acceptance: complete all four scenarios without controllers, then repeat the applicable gaze and one-handed paths. Check cancellation, temporary tracking loss, pause/resume, contrast and text scaling. Maintain every essential interaction within 0.61 m, with critical UI inside the project's ±20° horizontal / ±15° vertical target. Record device limitations honestly.

### D5. Present receipts and add the comparison carefully

Use the state/data contracts from technical R1-R3. Keep rehearsal result, human decision, proof verification and actual execution outcome separately visible. Show “Demo signature” for a local demo record. “Signature checked” requires the actual matching proof checks; a green/cyan appearance is not evidence.

A ledger item should show the reviewed action, source, decision time, model/receipt version, original/amended values and verification scope. Replay R2's stored historical evidence. Label legacy or unavailable history explicitly; never silently recompute it with today's model and call it the original.

After critical fixes, implement the original-versus-amended comparison from review p.7 using the real rehearsal model. Both alternatives share the same starting state and model. Use a patterned original path plus one active transparent ghost, with text/shape legends. The studio's illustrative SVG and its 180°/s teaching threshold are not production simulation logic.

If delegation UI is added, consume R3's offered, bounded, expiring, revocable rules. Preserve explicit unavailable states for unsupported live auto-approval. Do not enable a policy by storing only a visual preference.

Acceptance: changing the dial updates the actual comparison; a user can explain the difference without colour; switching active path does not double the ghost rendering cost; wrong/missing proof cannot appear verified; historical replay remains unchanged after a model update.

### D6. Apply identity and artwork

Use Stillpoint as the selected mark and the outlined logo assets in `design/brand1/assets/`. Retain the identity's clear space and minimum size. Use original cover exports for the launcher or presentation surfaces where they help; identify concept artwork appropriately and keep the real first task immediately accessible.

Preserve Cyclone's miniature materials, marked walkways and lack of human figures. Keep the cool rehearsal distinct from the physical model. Do not import the cover's high-resolution standalone scene, add decorative runtime shadows, or ship its duplicate Three.js build. The in-app service label remains “policy gate”; do not add third-party logos or promotional claims.

Acceptance: icons and assets load through the deployed base path, including a clean first load; no licence notices are lost; the logo never substitutes for the action glyph; the first-shift timing and rendering budget remain intact.

### D7. Verify and hand off

Use runtime observations for system-driven UI; an editor preview does not prove interaction. An active immersive session is required for pose and hand/gaze claims. Follow the installed skills for browser targets and managed-server recovery.

| Directory | Required check |
|---|---|
| `app/` | `npm run typecheck` before runtime work; then `npm test`; final `npm run build`. |
| `app/` | Existing hands-mode first-shift and extra interaction scripts, adapted only where behaviour intentionally changed. |
| Physical Quest 3/3S, when available | Sustained frame timing, narrow FoV, two rooms and no-table fallback; controllers unpaired. |

Add behavioural regression tests for changed settings, cancellation or data wiring. Avoid tests that only repeat colour constants. Save before/after runtime screenshots, settings bounds, selected font/size evidence, input-path results and device measurements under `docs/design1/`. Record build/device identifiers and separate mock, emulator and hardware evidence. Coordinate final performance checks with R6; target 72 fps, meet the 60 fps requirement, retain the ≤60k-triangle budget and one active transparent ghost.

## 5. Completion contract

- The visual system is applied to the application, including settings, task card, feedback, ledger and applicable entry assets.
- All existing registered functionality is preserved; shared contracts are integrated without fake verification, delegation or simulation claims.
- Required checks pass, and remaining external/device dependencies have specific evidence and blockers. Do not label incomplete required work as complete.
- `CAPABILITIES.md` contains accurate current evidence. `DECISIONS.md` records adaptations, including font/geometry choices and corrections to outdated access wording.
- Use the repository's milestone commit convention when executing implementation; include only task-owned changes. Publish only within existing human authorization and preserve the competition freeze.
- Final implementation report: changed areas, screenshots/evidence paths, checks run, unresolved dependencies, capability counts and whether anything was deployed. Do not invent device performance or submission success.
