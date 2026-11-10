# Cyclone · Calm Precision

Brand and UX design proposal v1.0 · 10 November 2026

This kit gives Cyclone a coherent visual identity and a set of reviewable interaction patterns. It includes an offline browser studio, logo assets, original cover artwork, fonts and licences, colour and geometry tokens, contrast measurements, and this implementation guide. It does not change the Cyclone application or certify headset accessibility. The review PDF is saved separately as `brief.review1.pdf` in the project root.

## 1. Design intent

Cyclone is the calm place where a person examines the consequence of an agent's proposed action. Its personality should be considered, tactile and precise. Warm materials make the miniature inviting; dark, opaque control surfaces make the task readable; restrained cyan makes a rehearsal distinct from the physical model.

Three principles guide the system:

1. **Show the consequence.** Put the proposed change, affected asset and visible breach ahead of architecture and policy jargon.
2. **Give control a shape.** Inspection can be exploratory. A decision has a deliberate gesture, progress and a reliable cancel path.
3. **Keep evidence precise.** Rehearsal, authorization, signed proof and actual execution are different facts.

The existing competition tagline can remain: “Cyclone — the calm eye where humans decide what AI agents do.” The artwork uses the shorter editorial line “Rehearse. Reshape. Decide.” This is a design recommendation, not a change to submitted copy.

## 2. Identity

**Selected direction: Stillpoint.** An open C surrounds a small, stable square. The opening suggests a review path; the square suggests the retained decision. Keep the symbol still. Do not animate a continuous spin or turn it into a risk indicator.

- Primary: ink symbol/wordmark on porcelain.
- Reverse: porcelain on ink.
- Accent: cyan symbol on ink, used sparingly.
- Clear space: at least one quarter of the symbol's full width, measured from visible artwork; the SVG already has a small internal margin.
- Minimum sizes: symbol 24 px; full lockup 160 px. Use the symbol alone below that lockup width.
- Do not stretch, outline, add glow, rotate, add a shadow, or place it on busy imagery without a quiet backing.
- A token's hash-derived glyph identifies its action binding. The Cyclone logo never replaces or implies that glyph.

Two alternate studies are included for comparison: Gate is more architectural; Orbit is more kinetic. Stillpoint is the recommended system used throughout the kit. SVG wordmarks contain outlined lettering, so they do not require installed fonts.

## 3. Palette and semantics

| Token | Hex | Use |
|---|---|---|
| Ink | #142B36 | Identity, text on light, primary structure |
| Deep ink | #0C1B22 | Dark canvas |
| Panel ink | #213D49 | Opaque XR text/control panel |
| Porcelain | #F5F1E8 | Warm light canvas; primary dark-mode text |
| Stone | #D8D4CA | Quiet material and background |
| Rehearsal | #62DCE8 | Active path and selected control on dark |
| Deep teal | #006775 | Accent text and focus on light |
| Attention | #E9B44C | Review required; dashed original path |
| Deep amber | #805900 | Attention text on light |
| High attention | #F29B55 | Increased consequence |
| Deep orange | #914A16 | High-attention text on light |
| Limit | #E982CA | Block, refusal or breach on dark |
| Deep berry | #913C74 | Limit/error text on light |

Supporting text is #526773 on light and #B7C8CB on dark. Interactive boundaries are #71868B on light and #7C959E on dark. The high-contrast palette uses #050B0F, white, #8AECFF, #FFD36A and #FF9FE1. All exact pairings are in `tokens.json` and `contrast-report.json`.

Use roughly 75–85% neutrals, 10–20% material tones and less than 5% state accents within a normal task view. This is a compositional guide, not a measured constraint. Keep walkthroughs and props quiet enough that a breach cue is obvious.

### Risk is never colour alone

| Level | Label | Shape | Pattern | Motion / caption |
|---|---|---|---|---|
| 0 | Routine | Circle | Solid | Still; low asset hum, captioned |
| 1 | Review | Triangle | Sparse diagonal | One arrival emphasis; “Review required” |
| 2 | High attention | Diamond | Dense diagonal | One deliberate cue; “Check the envelope” |
| 3 | Blocked | Square with lock | Cross-hatch | Static locked slot; “Action blocked” |

Risk level alone does not grant or remove authority. The policy requirement determines available actions. Do not automatically mark an action safe because the dial is cyan. Keep “within the rehearsal envelope” separate from “permitted by the policy gate.”

**Contrast:** 39 specified sRGB foreground/background pairings pass the design thresholds: 4.5:1 for normal text and semantic text, 3:1 for control boundaries. These results assume fully opaque surfaces. They do not establish WCAG conformance for the whole website or legibility through a headset. Do not place light cyan text on porcelain; use deep teal.

## 4. Typography

**Manrope 600–700**: identity and editorial/display headings. **Atkinson Hyperlegible Next 400–700**: controls, body, captions, units and numeric values. Both are included under the SIL Open Font License; retain their licence files in distributions. Avoid thin weights and condensed faces in XR.

| Role | Web starting size / line height | XR starting em size |
|---|---|---|
| Display | 64 px / 1.08 | Keep marketing display outside the task panel |
| Panel title | 32 px / 1.2 | 1.5 cm |
| Decision value | 40 px / 1.15 | 1.8 cm |
| Body / instruction | 18 px / 1.5 | 0.9 cm / 1.35 |
| Control label | 16 px / 1.4 | 1.0 cm |
| Supporting text | 14 px / 1.5 | 0.75 cm; never critical-only information |

Use sentence case. Keep numbers tabular, put the unit beside the value, and show original and proposed values with the same precision. Prefer “180°/s” to “180.” Use a one-line rationale with a labelled “Full rationale” disclosure. Do not make a disappearing caption the only source of an instruction.

XR sizes are em heights, not measured glyph heights. At 55 cm, a 0.9 cm em subtends about 0.94°; actual x-height is smaller and depends on the font. Offer 125% scaling and reflow the panel. Use the SDK's supported font/atlas route or the existing canvas labels; do not assume a TTF file can be assigned directly to UIKit. Ensure fonts are ready before measuring layout. Avoid shrinking texture labels to fit overflow.

## 5. Geometry and input controls

### Separate the units

`tokens.css` contains web values. `tokens.json.xr` contains centimetres for UIKit and metres for world coordinates. Never copy `48px` into a UIKit size as `48`; it would become 48 cm in this project. Always verify computed bounds after the actual prefab/component has mounted.

Recommended starting XR geometry:

- Panel: maximum 28 × 26 cm, viewed approximately 55 cm away.
- Padding: 1.2 cm; minimum inter-control gap: 0.8 cm.
- Touch/poke/ray target: 3.5 cm preferred, 3.2 cm minimum; visible target and hit target must agree.
- Everything interactive remains within 0.61 m of the current seated head; critical UI stays inside the project's ±20° horizontal / ±15° vertical target.
- Keep the task panel below or beside the current line of sight so it does not steal a pinch intended for the token. The existing project intentionally offsets its inspection card; tune rather than replacing it with a head-locked wall.
- Test dynamic card, dial, timeline, settings and ledger controls as well as fixed desk stations.
- Preserve the 60 × 40 cm miniature only when its whole footprint and the controls fit the table. Otherwise reposition or use the plinth; a nearby edge alone does not prove fit.

These dimensions are design starting points, not acceptance evidence. Text scaling may require fewer controls per page, not a wider panel outside reach.

### Component contract

| Component | Behaviour and states | Access / recovery |
|---|---|---|
| Action button | Rest, target/hover, focus, pressed, busy, unavailable, complete | ≥48 px web target; label stays during progress; unavailable reason stays readable |
| Number field / stepper | Persistent label and unit; explicit min/max/step; draft errors never become valid state | Arrow keys and named ± controls; numeric entry validates on edit; preserve the last valid rehearsal while error is visible |
| Parameter dial | Direct twist; value and unit visible; recalculates the preview | Stepper alternative; a value change cancels any active commitment |
| Timeline | Continuous preview-only scrub | Keyboard/ray alternatives; show current position; never sends a decision |
| Radio group | Mutually exclusive choice, e.g. input method | Visible group label; selected border plus indicator; arrow-key behaviour in the flat companion UI |
| Switch | Immediate preference with on/off state | Full row target; caption explains the consequence; never use a switch as authorization |
| Disclosure | Full rationale or secondary detail | Named control; supports keyboard; preserves the task and current edit |
| Select | A short finite list | Label and current value persist; use a full-size list in XR rather than a tiny desktop popup |
| Error | Text plus icon/border beside the field | Set invalid state; associate help/error with the field; keep entered value; focus the first invalid field after submit |
| Reset | Destructive local-data action | Explain exactly what will be removed; separate from normal preferences; deliberate confirmation and a clear Cancel |

### Settings organization

Use three short pages with a persistent Back/Close path, instead of ten cramped buttons:

1. **Input:** Hands / Gaze + pinch / One hand. Show left/right preference only for the one-handed path.
2. **Display:** text size, contrast, captions. Put reduced motion in an adjacent comfort page if the scaled controls no longer fit.
3. **Session:** recenter, replay first shift, history/reset. Keep demo/live source visible; live access requires actual availability, not a cosmetic toggle.

Do not place all settings at once on a larger panel. Explicitly constrain prefab minimum widths and inspect their computed width; the review found 80 cm buttons inside a 22 cm root.

## 6. Access and deliberate actions

- Hands-first is the baseline. Controllers can remain an optional convenience, never a requirement.
- Label the current gaze path **Gaze + pinch**. It is not eyes-only when a pinch is required. Verify whether the platform supplies eye gaze or head-directed targeting; name the supported behaviour accurately.
- Dwell may reveal an inspection. It never approves, accepts a delegation, resets data or starts a high-stakes action.
- Low-risk single approval remains a deliberate placement/pinch under its policy. Higher-stakes actions preserve the two-hand 1.5 second hold and the supported one-hand + sustained-gaze alternative.
- Both the countdown and the rehearsal must remain visible during a hold. Intentional release cancels. Input/tracking interruption must stop progress; if a short dropout debounce is retained, freeze progress and never let the decision complete during the dropout. A cancelled hold requires a fresh start.
- The browser specimen uses pointer/Space/Enter for a **practice** hold. Pointer exit, early release, focus loss and edit changes cancel it. It does not emulate the actual XR gesture gate.
- Captions begin on. Place a short cue near the related asset and retain important instructions on the card. Meaning is never audio-only.
- Reduced motion removes bloom, pulse, recoil and easing. Preserve explicit state changes and hold timing with stable text/progress.
- High contrast uses opaque backgrounds and clear outlines. Respect 125% text size with reflow and retest hand occlusion and reach.
- Keep the demo available without login. In a future live deployment, distinguish view, review and rule-management permissions. A role label is never authority; enforcement must remain in the policy/relay path.

## 7. Evidence and state language

| State | Suggested visible text | What it establishes |
|---|---|---|
| Proposal waiting | Held for review | The request has not been resolved |
| Rehearsal crosses envelope | Walkway crossed | A result from the named model and scenario |
| Rehearsal clears envelope | Within rehearsal envelope | The model shows no breach for the inspected state; not proof of real-world safety |
| Human decision submitted | Decision sent | A request has been sent; no completed execution claim |
| Awaiting proof | Checking decision record | Verification is pending; prevent an execution signal |
| Correct binding verified | Signature checked | The displayed record passed its binding, coverage and trust checks; show scope in detail |
| Proof failed / mismatched | Record could not be verified | No verified-execution eligibility; keep reason and recovery visible |
| Demo record | Demo signature | A local demo signature; not a production trust anchor |
| Action result observed | Execution confirmed | Only a real result/receipt can establish that an action happened |
| Expired | Expired · no action taken | Expiry is a rejection or timeout, never a caught-drill reward |

Do not turn “signature checked” into “safe,” or animate a completed physical action when proof failed. A rehearsal receipt preserves the model version, geometry, original/amended action, reviewed trajectory and decision-time binding. Keep later what-if replay distinct from that original record.

The example form demonstrates **bounded, revocable delegation**, a proposed feature. Include agent, asset, risk eligibility, lower and upper bounds, expiry and a revoke path. The current live relay refuses auto-approval; a design control cannot enable it. Three successful approvals do not establish statistical safety. Preserve “not offered,” “not permitted,” “expired” and “revoked” states.

## 8. Artwork and delivery

- `assets/cover-1920x1080.png`: finished landscape cover with exact typography.
- `assets/cover-social-1200x630.png`: social/link card composition.
- `assets/cover-artwork.png`: text-free original miniature illustration.
- `assets/logo-lockup-ink.svg` / `logo-lockup-paper.svg`: outlined vector wordmarks.
- `assets/logo-mark-*.svg`: vector symbols; PNG equivalents included.
- `assets/app-icon-1024.png`: square app identity artwork. Store-specific requirements still need checking at upload.
- `assets/app-mark-{24,48,128,512}.png`: transparent small-use marks.
- `assets/icon-*.svg` and `assets/icons.svg`: original consistent 24-unit line icon family.
- `fonts/`: two variable fonts with original OFL licences.
- `source/`: editable original 3D cover scene and reproduction instructions.

The cover is authored concept artwork, not a screenshot or evidence of a shipped capability. It uses a miniature arm, marked walkway, comparison traces and a seal without human figures or third-party branding. Use real application footage for the competition demonstration. The cover text is typeset locally; it contains no generated lettering.

## 9. Implementation sequence

1. Fix settings constraints and computed sizing before applying the new style.
2. Introduce shared semantic colours and type roles in the existing rendering paths. Keep legacy capability IDs and policy behaviours.
3. Improve the inspection card hierarchy: asset, change, consequence, requirement, next gesture, full rationale.
4. Apply the settings grouping and labelled controls. Add persistent onboarding resume/restart; test storage denied.
5. Preserve distinct rehearsal, decision, verification and execution states while fixing the review's binding/gating issues.
6. Add the original/amended visual comparison only after the core loop remains stable. Retain one active transparent ghost and use a patterned trace for the other path.
7. Verify the entire first shift on device: hands only, one-handed alternative, gaze path, cancellation, tracking loss, narrow FoV, 125% text, two rooms, table fallback and sustained frame time.

Mapping: palette work touches `app/src/models/palette.ts`; settings layout belongs in `app/public/ui/settings.uikitml` with behaviour in `app/src/systems/settings.ts`; card/twin/decision/seal systems consume the shared roles. Follow the repository's IWSDK skills and verify supported APIs. No SDK-specific component or font integration is claimed by this design kit.

## 10. Validation and provenance

The browser studio was checked for value editing, invalid-number rejection, early hold cancellation, sustained keyboard hold, clearing a prior decision after editing, keeping verification separate, negative delegation bounds, save/revoke, theme change, text scaling, reduced motion and captions. Additional layout and local-file checks are recorded in `VALIDATION.md`. These are checks of this prototype, not new passes against the Cyclone application.

Font sources: [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope), [Atkinson Hyperlegible Next](https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegiblenext). The original licence texts are included. Contrast uses the WCAG 2 relative-luminance formula; no external accessibility certification is claimed.

The logo, line icons and 3D miniature artwork were created locally for this design. A connected image-generation tool was unavailable, and no generated raster from that tool is included. The editable scene uses Three.js 0.181.0, matching the project dependency. Fonts retain their own licences; Three.js retains its MIT licence. Review these notices when distributing the source bundle.
