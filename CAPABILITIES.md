# Capability register — status

Copy of AGENTS.md §3 with a status column. ⬜ todo · 🟨 partial · ✅ verified (acceptance check run) · ⛔ blocked (human-only item).

Evidence: unit tests `app/tests/*.test.ts` (50) and `relay/tests` (46); emulator e2e, hands only:
`app/tests/e2e/drive.mjs` (first shift, 15/15 → `docs/e2e-onboarding.json`), `extras.mjs` (11/11 → `docs/e2e-extras.json`),
`capture.mjs`, `riskboard.mjs`; screenshots in `docs/screens/`.

| ID | Capability | Status | Evidence / what's left |
|---|---|---|---|
| C01 | Intercept: token drops into tray, light thread to asset, asset hums | 🟨 | Token drops into tray on arrival (e2e); thread drawn to the target machine and positional hum per machine are implemented and visible in screenshots, not asserted numerically. |
| C02 | Inspect: look → card; pinch → full rationale | 🟨 | Look → card (e2e). Pinch/poke on card toggles full rationale; not asserted. |
| C03 | Rehearse: scrub ghost; breach flares | ✅ | e2e scrub 0.85; unit breach at the exact walkway crossing for 250°/s. |
| C04 | Amend: twist dial; live re-rehearsal; breach clears | ✅ | e2e 250→180, breach cleared; unit ≤2 ms per re-rehearsal. |
| C05 | Decide — single: place in slot | ✅ | e2e APPROVE `place` with matching hash. |
| C06 | Dead-man's hold 1.5 s; release aborts | ✅ | e2e: release <1.5 s → no decision, token returns; hold → APPROVE_AMENDED. |
| C07 | Veto: push off the desk edge | 🟨 | e2e: drop off plinth edge and open-hand push off the edge → REJECT `veto_push`. Real detected-desk edge needs H3. |
| C08 | Forbidden: slot locks; veto/escalate only | ✅ | e2e lock + return; unit escalate/veto. |
| C09 | Escalate pad | ✅ | e2e: pad → ESCALATE, token parks in rack. |
| C10 | Seal crystal with hash glyph == token glyph | ✅ | e2e glyph match; unit signature verify/tamper. |
| C11 | Ledger replay | 🟨 | e2e: pick up seal → rehearsal replays. After-reload replay: ledger persistence unit-tested, replay-after-reload not run. |
| C12 | Amend semantics, both paths | 🟨 | Demo both flags ✅ (unit). Live: relay enforces amended hash (409) and ceiling (422); upstream amended approval undocumented → ⛔ H1 (D20a). |
| C13 | What you see is what you sign | 🟨 | Parity ✅ vs `intentHash()` (scenario bindings, mutations, 15 corpus vectors, edge cases, error codes); demo + relay refuse hash mismatch ✅. `npx @decionis/verify intent` exits 1 on the current corpus upstream (D20d). |
| C14 | Scripted onboarding, timings | 🟨 | e2e beats in order; first token 12 s, first seal 23 s (≤15 / ≤90 ✅). Human-paced ≈5 min to confirm on device. |
| C15 | Shift handover | ✅ | e2e: overnight queue of 4 loads, first token at 11.3 s. (Live overnight queue impossible: 5-min TTL, D20b.) |
| C16 | Drills | ✅ | e2e miss (0%) and catch (100%); reveal only after decision; replay on miss. |
| C17 | Trust rings → rule → drop on agent → auto-seal | ✅ | e2e: 3 clean approvals → ring full → rule offered → dropped on agent → AUTO_APPROVE_RULE sealed. |
| C18 | Shift summary | ✅ | e2e summary equals the session log. |
| C19 | Persistence + reset; works without storage | 🟨 | Unit ✅ (restore, reset, blocked storage). Reset button lives in the settings panel; panel buttons not yet e2e-clicked. |
| C20 | Table-plane anchor; 3 s plinth fallback | 🟨 | Plinth fallback ✅ e2e. Plane anchoring + XRAnchor implemented; needs a room with a table (H3). |
| C21 | Reach & FoV | 🟨 | Unit reach ✅ (all ≤0.61 m, none behind). Card geometry D7. FoV crop on Quest ⛔ H3. |
| C22 | Purposeful passthrough | 🟨 | Plinth edge ✅; passthrough-off shows the plinth; real desk edge ⛔ H3. |
| C23 | Risk never colour alone | ✅ | `docs/screens/risk-board.png`: all four levels distinct in greyscale by shape + hatching. |
| C24 | Spatial sound design | 🟨 | 13 synthesised cues, positional machine hums rising with risk; audible check needs a person/device. |
| C25 | Eyes-only mode | ✅ | e2e: gaze-pinch veto on chute; gaze-pinch approvals in handover; unit gating (low-risk single only). |
| C26 | One-handed hold | ✅ | e2e: one palm + gaze on the slot seal → APPROVE `one_hand_gaze_hold`. |
| C27 | High-contrast mode | ✅ | `docs/screens/risk-contrast.png` (materials and labels change). |
| C28 | Captions for every cue | 🟨 | Every cue carries a caption, on by default; visible in screenshots; not asserted per cue. |
| C29 | Pause/resume, fail closed | ✅ | e2e: exiting XR freezes the session clock; unit: expiry → REJECT `expired`/`timeout`, sink animation implemented. |
| C30 | Art direction | 🟨 | Procedural matte miniature + cool ghost (`docs/screens/`); art polish pass open. |
| C31 | Settings puck + UIKitML panel | 🟨 | e2e: pinch puck → panel opens/closes. Individual panel buttons not yet clicked in e2e. |
| C32 | The four demo intents | ✅ | Schema test + e2e plays each. |
| C33 | Future packs documented only | ✅ | README "Roadmap", SUBMISSION "What's next". |
| C34 | Demo mode static, no backend | ✅ | `dist/` served statically: demo loop runs, no backend requests (only the desktop emulator's room capture from a CDN; none on headsets). |
| C35 | Live relay | 🟨 | Built + 46 tests (auth, idempotency, 409/410/422, WS, webhook HMAC, verification). Live run ⛔ H1. |
| C36 | Scripted agent | 🟨 | Dry run produces the four documented requests; live run ⛔ H1. |
| C37 | ECS systems as modules + unit tests | ✅ | 13 systems; pure logic unit-tested. |
| C38 | Schema; blast radius from rehearsal | ✅ | Ajv validation; blast radius = target + downstream + breached zones. |
| C39 | Signed records & verification | 🟨 | Demo ✅. Relay verification ✅ in tests (corpus → unverified anchor; tampered/wrong JWKS/missing coverage → unverified; CLI exit 0/1). Genuine live dossier ⛔ H1. |
| C40 | Performance | 🟨 | Emulator: 29.9k triangles/frame (≤60k ✅), 60 fps; device fps ⛔ H3 (`docs/perf.md`). |
| C41 | No in-app brand strings | ✅ | `tests/brand.test.ts`; relay scrubs brand words from rendered summaries. |
| C42 | No human models; walkway markings | ✅ | All geometry procedural; walkway is a hatched floor marking; no figures. |
| C43 | Hands-only full run | ✅ | Both e2e suites run in hand-tracking mode only. |
| C44 | Deploy to GitHub Pages | ✅ | Live at https://ocularminds.github.io/cyclone/ via `.github/workflows/pages.yml` (typecheck, tests, build, deploy). Verified 2026-10-29: loads on desktop in demo mode, emulator injected, first token arrives, no failed requests or console errors. Keep unchanged through ~11 Dec. |
| C45 | README | ✅ | |
| C46 | SUBMISSION | ✅ | 479-word description; claims match the build. Launch date ⛔ H6. |
| C47 | VIDEO + capture mode + end card | 🟨 | `VIDEO.md`; `capture.mjs` ✅ (deterministic, end card 4 seals / 0 tokens). Recording ⛔ H4. |
| C48 | Cyclone policy file | 🟨 | `policy/cyclone.json` in the documented bundle format; provisioning ⛔ H1. |
| C49 | Recorded real dossiers for demo | ⛔ | Pipeline + check script built; needs an H1 live run. |
| C50 | Demo records in proof-bundle shape | ⬜ | Should; time-boxed, not started. |
