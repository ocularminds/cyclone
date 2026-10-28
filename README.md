# Cyclone

**The calm eye where humans decide what AI agents do.**

When an AI agent wants to change something in the physical world, a policy gate holds the call and Cyclone puts
it on your real desk as a small token beside a tabletop twin of the machines. Look at it to inspect, pull its
timeline to rehearse the outcome, twist its dial to amend it, then decide with your hands — and seal the decision
as a signed record bound to exactly what you rehearsed. *Approve the outcome, not the payload.*

Built with Meta's Immersive Web SDK 1.0 (WebXR, Three.js + ECS) for Meta VR Glasses (gaze + pinch) and Quest 3/3S.
Hands only, seated, everything within arm's reach.

> **Honesty notes.** Ghosts are *rehearsals* from each machine's kinematic model in the twin — not predictions or
> guarantees. In the demo, physical execution is simulated on the twin; no real machine is driven.

## Try it

**Public demo:** https://ocularminds.github.io/cyclone/

- **Headset (Quest 3/3S, Meta VR Glasses browser):** open the public URL and press **Enter**. Seated at a table is
  best: the twin anchors to the detected table; with no table it appears on a plinth at desk height after 3 s.
- **Desktop browser:** the same URL injects the Immersive Web Emulator so you can drive emulated hands.
- First visit plays the **first shift** (onboarding, ~5 min); later visits open the **shift handover**.
  `?mode=onboarding` or `?mode=handover` picks one; `?reset=1` clears local data.

| Gesture | Does |
|---|---|
| Look at a token | It lifts; its decision card unfolds in your central view |
| Pinch / poke the card | Full rationale |
| Pinch the timeline bead, pull it toward you | Scrub the ghost rehearsal; the breach point flares |
| Pinch the dial, twist | Amend the value; the rehearsal updates live |
| Place the token in the execute slot | Approve (single) |
| Then both palms on it for 1.5 s | Approve critical actions (let go to abort) |
| Push or drop it off the desk edge | Veto |
| Place it on the escalate pad | Escalate to a second reviewer (stays held) |
| Pick up a seal on the ledger shelf | Replay the rehearsal you approved |
| Drop an offered rule on an agent | Accept it; matching intents auto-execute |

Accessibility (settings puck, front-left corner — poke or pinch it): eyes-only mode (dwell to inspect; look at the
slot, chute or pad and pinch), one-handed mode (one palm + sustained gaze on the slot seal), high contrast, captions
(on by default). Risk is never colour alone: shape (smooth → spiked), motion (pulse → stutter), sound (rising tone)
and hatching, on a blue / amber / magenta palette.

## Run, test, build

```bash
cd app
npm install
npm run dev          # IWSDK-managed dev server + emulator (https://localhost:8081)
npm test             # unit tests: Intent v1 hash parity, kinematics, shift logic, schemas, reach, brand audit
npm run build        # static site in app/dist (deploys as-is; no backend)
```

Emulator end-to-end tests (hands only, controllers never used) need the dev server started with
`npx iwsdk dev up --allow-browser-automation`:

```bash
node tests/e2e/drive.mjs      # the whole first shift, 15 checks
node tests/e2e/extras.mjs     # escalate, one-handed, eyes-only, push veto, seal replay, pause, handover, trust rules
node tests/e2e/capture.mjs    # capture mode determinism + end card
```

Deploys to GitHub Pages from `main` via `.github/workflows/pages.yml` (Vite `base: './'`, demo mode default, no keys
in the client).

## Demo mode vs live mode

**Demo mode (default, what judges open)** runs entirely in the browser: a deterministic scenario engine replays
held-intent payloads in the policy gate's shape (Agent-Safe Intent v1 bindings and hashes) against the kinematic
simulator, and records are signed locally with a per-install Ed25519 demo key (labelled "demo signature").
No login, no backend, static hosting.

**Take-it-away statement:** remove the third-party policy gate and the whole loop still runs — twin, rehearsal,
gestures, sealing, drills, trust and the daily handover are all Cyclone.

**Live mode** (`?gate=live&relay=<url>&token=<session>`) connects the headset to the relay in `relay/`, which
receives held intents from Decionis AgentSafe, resolves them through the documented API with a presence
attestation bound to the intent hash, and verifies every returned Decision Dossier with `@decionis/verify` against
the pinned production JWKS. A seal shows *verified* only when signatures, required-artifact coverage and the
official trust anchor all pass. See `relay/README.md`, `policy/README.md` and `docs/agentsafe.md`.

## How it's built

- `app/` — IWSDK app. Pure logic in classes under `src/core`, `src/sim`, `src/flow`, `src/state`,
  `src/scenario`, `src/adapters`; thirteen ECS systems in `src/systems`; procedural "precision miniature" models in
  `src/models`; all sound synthesised with WebAudio.
- **What you see is what you sign.** Intent hashes follow Agent-Safe Intent v1. The browser port of `intentHash()`
  is byte-identical to `@decionis/verify` across every scenario binding, the published conformance corpus and edge
  cases (tests/parity.test.ts). An amended call is a distinct mutation with its own hash; the glyph on the token and
  on the seal derive from that hash.
- `relay/` — Node/TypeScript live relay (Fastify + WebSocket), runs the verifier in-process.
- `agent/` — scripted rule agent that issues the four demo tool calls through the policy gate.
- `policy/` — the Cyclone policy bundle.
- `DECISIONS.md` — every interpretation and deviation; `CAPABILITIES.md` — status of every capability.

## Roadmap (not built)

- **Two-person rule:** a second reviewer joins the same desk; escalations land in their rack.
- **Scenario packs:** data centre (power and cooling changes), lab automation (liquid handlers, incubators),
  commerce refunds (value and fraud envelopes).
- **Voice** alternatives to every gesture.
- **Real PLC integration** behind the relay, with execution receipts on the seal.

## Licence and assets

All Cyclone code is new (written from 28 Oct 2026). Every model is procedural and every sound synthesised; no
third-party art, logos or human figures. Third-party packages are used as dependencies under their own licences.
