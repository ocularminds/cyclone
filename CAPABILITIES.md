# Capability register — status

Copy of AGENTS.md §3 with a status column. ⬜ todo · 🟨 partial · ✅ verified (acceptance check run) · ⛔ blocked (human-only item).

Evidence: 68 app unit tests and 46 relay tests. Design1 immersive tests use IWSDK IWER hands only:
first shift 27/27, alternatives 14/14, settings/rationale 118/118, receipts 24/24.
Current results, mounted bounds, local-font evidence and before/after images are in
[docs/design1/README.md](docs/design1/README.md). Earlier evidence remains in `docs/screens/`.
Hardware and live-service limitations are kept separate from emulator results.

| ID | Capability | Status | Evidence / what's left |
|---|---|---|---|
| C01 | Intercept: token drops into tray, light thread to asset, asset hums | 🟨 | Token drops into tray on arrival (e2e); thread drawn to the target machine and positional hum per machine are implemented and visible in screenshots, not asserted numerically. |
| C02 | Inspect: look → card; pinch / named control → full rationale | ✅ | Hands-only dwell inspection, second pinch and named rationale controls; UI paging at 100%/125%. Card corners ≤59.484 cm, H ≤14.009° / V ≤13.514° (design1 UI/onboarding evidence). |
| C03 | Rehearse: scrub ghost; breach flares | ✅ | e2e scrub 0.85; unit breach at the exact walkway crossing for 250°/s. |
| C04 | Amend: twist dial; live re-rehearsal; breach clears | ✅ | e2e 250→180, breach cleared; unit ≤2 ms per re-rehearsal. |
| C05 | Decide — single: place in slot | ✅ | e2e APPROVE `place` with matching hash. |
| C06 | Dead-man's hold 1.5 s; release aborts | ✅ | Hands-only hold → APPROVE_AMENDED; early release aborts. Required-hand disconnect cannot finish; reconnect needs a fresh hold. Unit edit/pause/brief tracking-loss cases. |
| C07 | Veto: push off the desk edge | 🟨 | e2e: drop off plinth edge and open-hand push off the edge → REJECT `veto_push`. Real detected-desk edge needs H3. |
| C08 | Forbidden: slot locks; veto/escalate only | ✅ | e2e lock + return; unit escalate/veto. |
| C09 | Escalate pad | ✅ | e2e: pad → ESCALATE, token parks in rack. |
| C10 | Seal crystal with hash glyph == token glyph | ✅ | e2e glyph match; unit signature verify/tamper. |
| C11 | Ledger replay | ✅ | Physical pickup selects the intended record. After reload and a changed-model fixture, rendered original/reviewed paths equal retained samples. Legacy history explicitly unavailable; tampered history refused (24/24 receipt checks). |
| C12 | Amend semantics, both paths | 🟨 | Demo both flags ✅ (unit). Live: relay enforces amended hash (409) and ceiling (422); upstream amended approval undocumented → ⛔ H1 (D20a). |
| C13 | What you see is what you sign | 🟨 | Parity ✅ vs `intentHash()` (scenario bindings, mutations, 15 corpus vectors, edge cases, error codes); demo + relay refuse hash mismatch ✅. `npx @decionis/verify intent` exits 1 on the current corpus upstream (D20d). |
| C14 | Scripted onboarding, timings | 🟨 | All beats in order; first token 6.0 s, first seal 25.4 s. Automated shift 179 s. Completion/resume persisted; human-paced ≈5 min remains a device check. |
| C15 | Shift handover | ✅ | Completed onboarding opens handover; unfinished onboarding resumes. Overnight demo queue starts at 3.0 s (extras). Live overnight held queue still limited by upstream TTL (D20b). |
| C16 | Drills | ✅ | E2E miss (0%) and deliberate catch (100%); reveal after decision and replay on miss. Explicit timeout/miss, correction, unresolved escalation and false-alarm semantics, tested and persisted. |
| C17 | Trust rings → bounded rule → drop → auto-seal | ✅ | Three clean approvals → actual offer → drop on agent → auto-seal. Actual Revoke control leaves a new matching proposal held. Unit scope/agent/asset/unit/risk/bounds/expiry/legacy checks; live auto-approval unavailable. |
| C18 | Shift summary | ✅ | e2e summary equals the session log. |
| C19 | Persistence + reset; works without storage | ✅ | Signed snapshots survive reload unchanged; settings, trust and scores persist. Actual reset cancellation/confirmation controls pass; unit blocked-storage/corrupt-settings and onboarding-resume checks. |
| C20 | Table-plane anchor; 3 s plinth fallback | 🟨 | Plinth fallback ✅ e2e. Plane anchoring + XRAnchor implemented; needs a room with a table (H3). |
| C21 | Reach & FoV | 🟨 | Actual settings, card, receipt and physical-control geometry checked at both text sizes (design1 bounds); card stays in desk frame after opening. Quest FoV crop and real seated-room placement remain H3. |
| C22 | Purposeful passthrough | 🟨 | Plinth edge ✅; passthrough-off shows the plinth; real desk edge ⛔ H3. |
| C23 | Risk never colour alone | ✅ | `docs/screens/risk-board.png`: all four levels distinct in greyscale by shape + hatching. |
| C24 | Spatial sound design | 🟨 | 13 synthesised cues, positional machine hums rising with risk; audible check needs a person/device. |
| C25 | Gaze + pinch (accurate label for the former eyes-only path) | ✅ | Head direction inspects; hand ray + pinch selects on emulator/Quest path. Low-risk single approvals and chute veto pass in extras. Dwell never authorizes. True eye-only input is not claimed (D38). |
| C26 | One-handed hold | ✅ | Required preferred palm + sustained gaze for 1.5 s → APPROVE; disconnect cancels without a decision and requires fresh input. Preferred hand selection passes through settings. |
| C27 | High-contrast mode | ✅ | Actual settings interaction changes palette; Ink/Porcelain/high-contrast text and focus contrast tests pass. Runtime material/label captures retained in design1. |
| C28 | Captions for every cue | 🟨 | Every cue carries a caption, on by default; visible in screenshots; not asserted per cue. |
| C29 | Pause/resume, fail closed | ✅ | e2e: exiting XR freezes the session clock; unit: expiry → REJECT `expired`/`timeout`, sink animation implemented. |
| C30 | Art direction | ✅ | Warm procedural matte miniature, marked walkways, cool ghost and non-colour risk shapes reviewed in `docs/design1/ui-runtime-review.jpg` and the retained risk captures. Corrected reading surfaces remain visible above shelf geometry (`occlusion.json`, 10/10). All models self-made; no branded products or people. Device legibility remains C21/H3. |
| C31 | Settings puck + UIKitML panel | ✅ | 118/118 UI checks: 23 mounted page snapshots, all toggles, Back/Close, return to task, reset cancel/confirm at 100%/125%. Panel 28×26 cm; 3.5 cm targets with inherited 80 cm minimum removed. |
| C32 | The four demo intents | ✅ | Schema test + e2e plays each. |
| C33 | Future packs documented only | ✅ | README "Roadmap", SUBMISSION "What's next". |
| C34 | Demo mode static, no backend | ✅ | Production `/cyclone/` clean context: 11/11 checks, all four decisions/snapshots/signatures; local fonts and identity load. Backend traffic blocked. Only the SDK's static room/input models use CDNs; strict all-remote block also completes the loop but reports the missing room asset (design1 evidence). |
| C35 | Live relay | 🟨 | Built + 46 tests (auth, idempotency, 409/410/422, WS, webhook HMAC, verification). Live run ⛔ H1. |
| C36 | Scripted agent | 🟨 | Dry run produces the four documented requests; live run ⛔ H1. |
| C37 | ECS systems as modules + unit tests | ✅ | 13 systems; pure logic unit-tested. |
| C38 | Schema; blast radius from rehearsal | ✅ | Ajv validation; blast radius = target + downstream + breached zones. |
| C39 | Signed records & verification | 🟨 | Demo signatures, immutable snapshot digest, reload and tamper checks pass. Incomplete live binding/proof remains unverified, and never animates physical execution. Authoritative relay R1 binding work and genuine provisioned dossiers (H1) remain open. |
| C40 | Performance | 🟨 | Final design1 emulator: 30,312 triangles maximum, 278 draw calls, one active ghost, 60.01 fps over 480 frames. Desktop only; sustained Quest FPS/thermal/FoV checks remain H3 (`docs/perf.md`). |
| C41 | No in-app brand strings | ✅ | `tests/brand.test.ts`; relay scrubs brand words from rendered summaries. |
| C42 | No human models; walkway markings | ✅ | All geometry procedural; walkway is a hatched floor marking; no figures. |
| C43 | Hands-only full run | ✅ | Both e2e suites run in hand-tracking mode only. |
| C44 | Deploy to GitHub Pages | ✅ | [Public demo](https://ocularminds.github.io/cyclone/), deployed from `main` by `.github/workflows/pages.yml`. Design1 production build verified under `/cyclone/`; `public.mjs` checks the published demo/XR, first token and signed snapshot after deployment. Competition freeze remains 17 Nov through ~11 Dec. |
| C45 | README | ✅ | |
| C46 | SUBMISSION | ✅ | 439-word description reflects implemented demo, updated access/scoring and current R1/H1/H3 limits. Launch confirmation remains H6. |
| C47 | VIDEO + capture mode + end card | 🟨 | `VIDEO.md` matches actual conveyor/arm/drill flow. Capture 6/6: deterministic hash, captions on, end card 4 seals / 0 tokens, even row, idle machines, hidden HUD/ghost. Physical recording remains H4. |
| C48 | Cyclone policy file | 🟨 | `policy/cyclone.json` in the documented bundle format; provisioning ⛔ H1. |
| C49 | Recorded real dossiers for demo | ⛔ | Pipeline + check script built; needs an H1 live run. |
| C50 | Demo records in proof-bundle shape | ⬜ | Should; time-boxed, not started. |
