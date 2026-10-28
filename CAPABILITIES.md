# Capability register — status

Copy of AGENTS.md §3 with a status column. ⬜ todo · 🟨 partial · ✅ verified (acceptance check run) · ⛔ blocked (human-only item).
Evidence: `app/tests/*.test.ts` (vitest, `npm test`), `app/tests/e2e/drive.mjs` (IWSDK emulator, hands only; results in `docs/e2e-onboarding.json`), screenshots in `docs/screens/`.

| ID | Capability | Status | Evidence / what's left |
|---|---|---|---|
| C01 | Intercept: token drops into tray, light thread to asset, asset hums | 🟨 | Token spawns in tray on held intent (e2e, first token 10.8 s after entry). Thread + positional hum implemented; not yet asserted by e2e. |
| C02 | Inspect: look → card (agent+sigil, rationale, rule, blast radius); pinch → full rationale | 🟨 | Look → card opens (e2e). Pinch/poke → full rationale implemented, not yet asserted. |
| C03 | Rehearse: pull timeline handle to scrub ghost; breach flares | ✅ | e2e: handle pull → scrub 0.86; unit: breach at exact walkway crossing for 250°/s (`sim.test.ts`). |
| C04 | Amend: twist dial; ghost re-rehearses; breach clears | ✅ | e2e: dial twist 250→180, breach cleared; unit: re-rehearsal ≤2 ms/step. |
| C05 | Decide — single: place in execute slot | ✅ | e2e: place → APPROVE with matching hash; unit hash binding. |
| C06 | Decide — two-hand dead-man's hold 1.5 s; release aborts | ✅ | e2e: release before 1.5 s → no decision, token returns; hold → APPROVE_AMENDED. |
| C07 | Veto: push off desk edge into chute | 🟨 | e2e: off plinth edge → REJECT `veto_push`. Detected-desk edge needs a plane (emulator/device). |
| C08 | Forbidden: slot locks; only veto/escalate | ✅ | e2e: lock + token returns; unit: escalate and veto still work. |
| C09 | Escalate pad → ESCALATE, token parks in rack | 🟨 | Unit ✅; pad placement e2e not run yet. |
| C10 | Seal crystal with hash glyph == token glyph, on ledger shelf | ✅ | e2e glyph match; unit signature verify/tamper. |
| C11 | Ledger replay: pick up seal → replay; after reload | 🟨 | Implemented (SealSystem); not tested. |
| C12 | Amend semantics both paths | 🟨 | Demo: both flag values unit-tested (approve-amended, denial keeps token held, counter-offer re-proposal). Live ⛔ H1 + D20(a). |
| C13 | What you see is what you sign (Intent v1 parity, tamper refusal) | 🟨 | Parity ✅ vs `intentHash()` for all scenario bindings, amended mutations, 15 corpus vectors, edge cases and error codes. Demo gate refuses tampered hash ✅. Relay refusal pending (C35). CLI `intent` exit 1 upstream (D20d). |
| C14 | Scripted onboarding, timings | 🟨 | e2e: beats in order; first token 10.8 s, first seal 24 s. Hint pulses implemented, not asserted. Human-paced full shift to measure on device. |
| C15 | Shift handover | 🟨 | Handover scenario; first token ≤15 s (unit). Live overnight queue impossible (D20b). |
| C16 | Drills, reveal after decision, replay on miss, calibration | ✅ | Unit + e2e: "missed" only after approval, calibration 0% (0/1), replay emitted. |
| C17 | Trust rings → rule offer → drop on agent → auto-seal | 🟨 | Unit ✅ (ring math, offer, wrong-agent refusal, auto-seal). Rule drop e2e not run. |
| C18 | Shift summary | ✅ | e2e: summary equals session log (4 decisions, 1 amended, 1 vetoed, 1 drill missed). |
| C19 | Persistence + reset; works without storage | 🟨 | Unit ✅ (reload restores, reset clears, blocked storage still runs). Reset button e2e pending. |
| C20 | Tabletop anchored to table plane; 3 s plinth fallback | 🟨 | Plinth fallback ✅ e2e. Plane anchoring implemented (XRPlane + XRAnchor); needs a plane (device/emulator room). |
| C21 | Reach & FoV | 🟨 | Unit reach check ✅ (all interactables ≤0.61 m, none behind). Card geometry per D7. FoV crop on Quest ⛔ H3. |
| C22 | Purposeful passthrough: real desk edge = chute; VR plinth | 🟨 | Plinth edge ✅; real desk edge needs device. |
| C23 | Risk never colour alone | 🟨 | Shape/motion/hatch/tone implemented; greyscale screenshot pending. |
| C24 | Spatial sound design | 🟨 | Synth voices + 13 cues implemented; per-event firing not asserted. |
| C25 | Eyes-only mode | 🟨 | Gesture policy unit ✅; e2e pending. |
| C26 | One-handed hold + gaze on seal | 🟨 | Implemented; e2e pending. |
| C27 | High-contrast mode | 🟨 | Implemented; screenshot pending. |
| C28 | Captions for every cue | 🟨 | Every cue carries a caption (on by default); assertion pending. |
| C29 | Pause/resume, fail closed, sink + auto-reject | 🟨 | Unit ✅ (pause freezes TTL; expiry → REJECT expired/timeout). Browser visibility pause pending. |
| C30 | Art direction "precision miniature" | 🟨 | Procedural matte machines + cool ghost; art pass pending. |
| C31 | Settings puck + UIKitML panel | 🟨 | Implemented; render/interaction not yet verified. |
| C32 | The four demo intents | ✅ | `schema.test.ts` asserts all four with policy/risk; e2e plays each end to end. |
| C33 | Future packs documented only | ⬜ | README / SUBMISSION. |
| C34 | Demo mode static, no backend | 🟨 | Runs fully in browser; static `dist/` test with backend blocked pending. |
| C35 | Live relay (Node) | ⬜ | Next. |
| C36 | Scripted agent | ⬜ | |
| C37 | ECS systems as modules + unit tests | ✅ | 13 systems in `app/src/systems/`; non-visual logic in pure classes with 46+ unit tests. |
| C38 | HeldIntent schema; blast radius from rehearsal | ✅ | Ajv validation of scenario files and generated intents; blast radius = target + downstream + breached zones. |
| C39 | Signed records & verification | 🟨 | Demo ✅ (verify OK, tamper fails). Live ⬜ (relay). |
| C40 | Performance budget + on-device profiling | ⛔ | H3 for device fps. Emulator: 60 fps. Triangle count to log. |
| C41 | No in-app brand strings | ⬜ | Audit pending. |
| C42 | No human models; walkway markings | 🟨 | All geometry procedural, walkway is a hatched floor marking; formal audit pending. |
| C43 | Hands-only full run | ✅ | `drive.mjs` completes the whole first shift in hand-tracking mode; controllers never used. |
| C44 | Deploy to GitHub Pages | ⬜ | |
| C45 | README | ⬜ | |
| C46 | SUBMISSION | ⬜ | |
| C47 | VIDEO + capture mode + end card | 🟨 | `?capture=1` / `?capture=endcard` boot paths exist; VIDEO.md pending. |
| C48 | Cyclone policy file | ⬜ | |
| C49 | Recorded real dossiers for demo | ⛔ | Needs H1 live run; fixture pipeline pending. |
| C50 | Demo records in proof-bundle shape | ⬜ | Should; time-boxed. |
