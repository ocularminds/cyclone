# Cyclone

**The calm eye where humans decide what AI agents do.**

A held action lands on your desk as a token beside a miniature factory. Inspect it, rehearse the motion,
amend the value, decide with your hands, and keep a signed decision receipt. Cyclone uses IWSDK 1.0.1,
TypeScript and WebXR, with hands-first interactions for Meta VR Glasses and Quest 3/3S.

Ghosts are **rehearsals from a kinematic model**, not predictions or guarantees. Demo execution is simulated
on the miniature; no real machine is driven. A signature, an authorization and physical execution are separate facts.

## Try it

[Open the public demo](https://ocularminds.github.io/cyclone/).
[Watch the 2:49 emulator demo on YouTube](https://youtu.be/NaKl8JTSMP4).
The video labels simulated execution throughout. The [original MP4](https://ocularminds.github.io/cyclone/video/cyclone-revision1.mp4) is also available.

- On a headset, open the URL and select **Enter**. A suitable table anchors the miniature; after three seconds
  without one, a seated plinth appears. Physical Quest performance, room placement and narrow FoV checks remain H3.
- On desktop, the Immersive Web Emulator provides emulated hands.
- The first shift resumes unfinished scenarios after reload. Completing all four graduates the next launch into
  handover. Opening settings or refreshing does not count as completing onboarding.
- `?mode=onboarding` and `?mode=handover` choose a mode. **Settings → Session → Replay first shift** restarts
  the tutorial while keeping receipts. **Advanced and history → Rules and reset → Reset local data** explains
  the reset scope and requires confirmation. `?reset=1` is the equivalent development shortcut.

| Interaction | Result |
|---|---|
| Look at a token | It lifts and opens its review card |
| Select **Full rationale**, or pinch an already inspected token | Read the full rationale; long pages have Previous/Next controls |
| Pinch the timeline bead and pull toward you | Scrub the rehearsal and its envelope crossing |
| Pinch and twist the dial, or use **Amend** step controls | Change a bounded value; invalid edits retain the last valid rehearsal |
| Select **Compare** | Dashed original path, solid proposed path, one active translucent ghost |
| Place in the execute slot | Approve a `single` action |
| Place, then keep both palms on it for 1.5 seconds | Approve a critical action; release cancels and requires a fresh start |
| Push or drop past the desk edge | Veto |
| Place on the escalate pad | Escalate; the action remains held |
| Pick up a ledger seal | Inspect its action, proof and retained historical rehearsal |
| Drop an offered rule on its agent | Accept the displayed, bounded demo rule |

The settings puck supports poke and pinch. Its paged controls include Ink/Porcelain themes, high contrast,
100%/125% text, captions (initially on), reduced motion, and a preferred hand. **Gaze + pinch** uses head direction
to inspect and a hand ray to select on Quest/emulator; it is not eyes-only interaction. The one-hand alternative
requires the selected palm plus sustained head-directed gaze on the slot seal for the same 1.5 seconds.
Tracking interruption freezes progress and cannot finish a decision; a longer interruption cancels it.

Risk combines text, hatching, motion and sound with circle/triangle/diamond/locked-square silhouettes. Colour alone
never grants an action. Reduced motion removes decorative bloom, pulsing and recoil while preserving hold timing.

## Run, test, build

```bash
cd app
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

The build is a static site in `app/dist/`. GitHub Pages deploys `main` through `.github/workflows/pages.yml`;
Vite's relative base keeps models, local fonts and icons working under `/cyclone/`. No client service keys ship.

For immersive emulator evidence, start the managed server with
`npx @iwsdk/cli dev up --allow-browser-automation`, then run:

```bash
node tests/e2e/drive.mjs       # four scenarios, hands only, including cancellation
node tests/e2e/extras.mjs      # alternative inputs, escalation, replay and bounded rules
node tests/e2e/design-ui.mjs   # every settings page at both text sizes, reset and rationale
node tests/e2e/receipts.mjs    # after drive: reload, stored replay, legacy and tamper checks
node tests/e2e/revision-ui.mjs # after a capture shift: proof export/retry and translated head positions
node tests/e2e/spatial.mjs     # actual dial, timeline, ledger and rule geometry
node tests/e2e/capture.mjs     # deterministic recording and end-card state
node tests/e2e/occlusion.mjs   # stereo panel draw order plus hand-input regression
```

Set `CYCLONE_EVIDENCE=../docs/revision1` to save current evidence separately from the original baseline.
See [the revision evidence](docs/revision1/README.md), [design evidence](docs/design1/README.md) and [the capability register](CAPABILITIES.md)
for what was actually checked. Emulator results do not establish headset frame rate or real hand-tracking quality.

## Demo and live modes

**Demo is the default.** A deterministic scenario engine, simulator and per-install Ed25519 key run locally.
Receipts say **Demo signature**. They retain original/reviewed bindings, values, model version, geometry, poses,
paths and breach results. The signed snapshot has a separate local rehearsal digest; it does not change the
Agent-Safe Intent v1 action hash. Ledger replay uses that retained evidence after reload. Older argument-only
records remain readable and explicitly say that their original rehearsal is unavailable.
**Receipt → Proof → Export proof** downloads a public demo proof bundle and JWKS in one JSON file.
`npx @decionis/verify --file <export.json> --jwks <export.json>` checks its signatures. The key is local,
never an official service trust anchor; neither that check nor the rehearsal establishes physical execution.

**Take-it-away statement:** remove the external policy gate and the full loop still runs: twin, rehearsal,
gestures, seals, drills, trust and handover. No login or backend is needed.

Drill results distinguish catches, misses, corrections, escalations and timeouts. A timeout counts as a miss;
an unresolved escalation is unassessed. False alarms are separate. A trust ring is a progression cue. Its offered
demo rule applies only to the named agent, conveyor, fixed line argument, unit and range (0 through +5%), routine risk, and single
approval for eight hours. Drills never qualify. Rules can be revoked in settings. Live auto-approval is unavailable.

**Live mode** uses a separately configured Node relay (`?gate=live&relay=<url>&token=<session>`).
Missing configuration leaves the demo available. The UI requires matching action proof as well as signature,
artifact coverage and official trust anchor before it can display an official verified seal. The relay now checks
the signature-covered decision and exact Intent v1 binding against the held action. Authorization, proof status
and execution remain separate; **Retry check** retrieves the same record without requesting another approval.
An uncertain network result stays pending across restart. No live result animates physical execution: there is
no actuator integration. These cases pass local signed-fixture tests; provisioned service acceptance remains H1.
Live amendment is advertised as unavailable because the public API only documents a fresh proposal for a changed
binding. The demo exercises both amendment and counter-offer paths. See [relay setup](relay/README.md),
[policy setup](policy/README.md), and [documented integration limits](docs/agentsafe.md).

## How we built it

- `app/` contains the simulator, scenario engine, state, adapters and thirteen ECS systems. Models are procedural;
  WebAudio synthesises the sound. The Calm Precision system uses opaque semantic surfaces and local fonts.
- Intent hashes use Agent-Safe Intent v1. The browser port matches `intentHash()` from `@decionis/verify` for
  scenario bindings, mutations, conformance vectors and edge cases. The upstream CLI corpus failure remains
  documented in D53 (15 of 16 current corpus files pass; `policy-projection.json` fails in verifier 0.5.0);
  parity does not turn that failed CLI check into a pass. Token and seal glyphs derive from
  the reviewed hash, including amendments.
- `relay/` integrates Decionis AgentSafe and runs `@decionis/verify` server-side. It is never bundled into the headset.
  `agent/` contains the scripted live agent, and `policy/` the provisionable policy bundle.
- [Decisions](DECISIONS.md) record adaptations and dependencies. [Submission copy](SUBMISSION.md) and
  [the video guide](VIDEO.md) distinguish the working demo from live and hardware checks still needed.

## Roadmap — not built

- Two-person review at the same desk.
- Data-centre, lab-automation and commerce-refund scenario packs.
- Voice alternatives.
- Real PLC integration with physical execution receipts.

## Licence and assets

Cyclone code is new, written from 28 October 2026. Miniatures and markings are procedural, with no human figures.
The Stillpoint entry mark is original project artwork. Manrope and Atkinson Hyperlegible Next ship locally under
their preserved OFL notices. The tabular-digit derivative and renderer route are documented in
[fonts.md](docs/design1/fonts.md). Third-party packages retain their own licences; the brand studio's standalone
Three.js and cover scene are not application dependencies.
