# Capability register — status

Copy of AGENTS.md §3 with a status column. ⬜ todo · 🟨 partial · ✅ verified (acceptance check run) · ⛔ blocked (human-only item).

Evidence: **81 app unit tests and 70 relay tests pass**. Revision1 IWSDK IWER checks use emulated hands:
first shift 27/27, alternatives 14/14, retained receipts 24/24, revision UI 17/17, sensory 33/33,
spatial bounds 6/6 and capture 6/6. The existing design settings/rationale check remains 118/118.
[Revision evidence](docs/revision1/README.md) separates runtime input, fixture injection, local production,
public deployment, device and live-service evidence. [Design evidence](docs/design1/README.md) is retained.

Current totals: **35 verified · 14 partial · 1 human-blocked · 0 todo**. No capability was removed.

| ID | Capability | Status | Evidence / what's left |
|---|---|---|---|
| C01 | Intercept: token drops into tray, light thread to asset, asset hums | ✅ | Hands runtime arrival <1 s; all four tethers numerically target the correct asset. WebAudio panners match the machine world positions and have distinct voices (`sensory.json`, 33/33 combined checks). |
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
| C12 | Amend semantics, both paths | 🟨 | Demo both flags pass. Relay validates distinct amended hash and ceiling, but always advertises live amendment unavailable. A documented amendment contract and provisioned acceptance are still required (D51/H1); a changed live binding uses a fresh proposal. |
| C13 | What you see is what you sign | 🟨 | Browser/reference parity passes for all scenarios, mutations, 16 current corpus files and canonicalization edge cases (20 tests). Full verifier 0.5.0 CLI: 15/16 reproduced, exit 1 on retained `policy-projection.json`; exact upstream dependency in D53. |
| C14 | Scripted onboarding, timings | 🟨 | All onboarding beats fire in order. Captured hands run: first token 6 s, first seal 25.5 s, satisfying moment 28.3 s, summary 176 s. Completion/resume/reset are tested; unfamiliar-user ≈5-minute timing remains unperformed. |
| C15 | Shift handover | ✅ | Completed onboarding opens handover; unfinished onboarding resumes. Overnight demo queue starts at 3.0 s (extras). Live overnight held queue still limited by upstream TTL (D20b). |
| C16 | Drills | ✅ | E2E miss (0%) and deliberate catch (100%); reveal after decision and replay on miss. Explicit timeout/miss, correction, unresolved escalation and false-alarm semantics, tested and persisted. |
| C17 | Trust rings → bounded rule → drop → auto-seal | ✅ | Three clean approvals → actual offer → drop on agent → auto-seal. Actual Revoke control leaves a new matching proposal held. Unit scope/agent/asset/unit/risk/bounds/expiry/legacy checks; live auto-approval unavailable. |
| C18 | Shift summary | ✅ | e2e summary equals the session log. |
| C19 | Persistence + reset; works without storage | ✅ | Signed snapshots survive reload unchanged; settings, trust and scores persist. Actual reset cancellation/confirmation controls pass; unit blocked-storage/corrupt-settings and onboarding-resume checks. |
| C20 | Table-plane anchor; 3 s plinth fallback | 🟨 | 3 s plinth fallback passes. Runtime ECS plane-selection fixtures cover full/small/rotated/side/no table and different seated positions (6/6); these inject the plane boundary and do not verify native detection/anchors. Real rooms remain H3. |
| C21 | Reach & FoV | 🟨 | Actual card/settings/receipt/control vertices at 100%/125% pass, maximum reach 60.644 cm. Translated-head UI reflow passes; exact board-fit tests include a concave notch. Native Quest FoV crop and seated-room placement remain H3. |
| C22 | Purposeful passthrough | 🟨 | Plinth edge ✅; passthrough-off shows the plinth; real desk edge ⛔ H3. |
| C23 | Risk never colour alone | ✅ | `docs/screens/risk-board.png`: all four levels distinct in greyscale by shape + hatching. |
| C24 | Spatial sound design | 🟨 | Runtime audio checks establish four distinct positional machine voices with rising risk pitch and 13 cue mappings (33/33 combined checks); real workflow audio is retained in the video. Human listening/location assessment remains unperformed. |
| C25 | Gaze + pinch (accurate label for the former eyes-only path) | ✅ | Head direction inspects; hand ray + pinch selects on emulator/Quest path. Low-risk single approvals and chute veto pass in extras. Dwell never authorizes. True eye-only input is not claimed (D38). |
| C26 | One-handed hold | ✅ | Required preferred palm + sustained gaze for 1.5 s → APPROVE; disconnect cancels without a decision and requires fresh input. Preferred hand selection passes through settings. |
| C27 | High-contrast mode | ✅ | Actual settings interaction changes palette; Ink/Porcelain/high-contrast text and focus contrast tests pass. Runtime material/label captures retained in design1. |
| C28 | Captions for every cue | ✅ | All 13 cue names individually emit audio once and render the mapped caption with captions on (`sensory.json`). The injection is labelled; natural workflow captions also appear in the recorded hands run. |
| C29 | Pause/resume, fail closed | ✅ | e2e: exiting XR freezes the session clock; unit: expiry → REJECT `expired`/`timeout`, sink animation implemented. |
| C30 | Art direction | ✅ | Warm procedural matte miniature, marked walkways, cool ghost and non-colour risk shapes reviewed in `docs/design1/ui-runtime-review.jpg` and the retained risk captures. Corrected reading surfaces remain visible above shelf geometry (`occlusion.json`, 10/10). All models self-made; no branded products or people. Device legibility remains C21/H3. |
| C31 | Settings puck + UIKitML panel | ✅ | 118/118 UI checks: 23 mounted page snapshots, all toggles, Back/Close, return to task, reset cancel/confirm at 100%/125%. Panel 28×26 cm; 3.5 cm targets with inherited 80 cm minimum removed. |
| C32 | The four demo intents | ✅ | Schema test + e2e plays each. |
| C33 | Future packs documented only | ✅ | README "Roadmap", SUBMISSION "What's next". |
| C34 | Demo mode static, no backend | ✅ | Production `/cyclone/` clean context: 11/11 checks, all four decisions/snapshots/signatures; local fonts and identity load. Backend traffic blocked. Only the SDK's static room/input models use CDNs; strict all-remote block also completes the loop but reports the missing room asset (design1 evidence). |
| C35 | Live relay | 🟨 | 70 relay tests pass: auth, binding/TTL/refusal, signed association, independent authorization/proof/execution, durable uncertainty, monotonic updates and verification-only recovery. No physical actuator. Provisioned live run remains H1. |
| C36 | Scripted agent | 🟨 | Dry run produces the four documented requests; live run ⛔ H1. |
| C37 | ECS systems as modules + unit tests | ✅ | 13 systems; pure logic unit-tested. |
| C38 | Schema; blast radius from rehearsal | ✅ | Ajv validation; blast radius = target + downstream + breached zones. |
| C39 | Signed records & verification | 🟨 | Demo signatures, retained history and export verification pass. Relay now verifies signature-covered exact action/decision association and recovers proof without re-approving; local signed fixtures cover mismatch/tamper/restart. Genuine production proof still requires H1. |
| C40 | Performance | 🟨 | Revision1 desktop IWER: 480 frames, 60.002 fps, p95 16.9 ms, 30,312 triangles, 276 calls, one active ghost. Clean local production cold first token 7.311 s. Bundle audited. These are not sustained Quest measurements; H3 remains (`docs/perf.md`). |
| C41 | No in-app brand strings | ✅ | `tests/brand.test.ts`; relay scrubs brand words from rendered summaries. |
| C42 | No human models; walkway markings | ✅ | All geometry procedural; walkway is a hatched floor marking; no figures. |
| C43 | Hands-only full run | ✅ | Both e2e suites run in hand-tracking mode only. |
| C44 | Deploy to GitHub Pages | ✅ | [Public demo](https://ocularminds.github.io/cyclone/) deploys from main with relative Vite base. Revision1 public build/asset/video checks and workflow IDs are recorded in `docs/revision1/release.json`. Freeze 17 Nov; preserve submitted build through ~11 Dec. |
| C45 | README | ✅ | |
| C46 | SUBMISSION | ✅ | 442-word description reflects the implemented demo, access/scoring, repaired proof recovery and remaining live/device limitations. Launch date remains Q1 2027 (confirm/H6); final submission remains H2. |
| C47 | VIDEO + capture mode + end card | 🟨 | Finished 2:49 actual emulator workflow video, captions and edit provenance retained; capture 6/6 including four-seal empty-tray end card. Public MP4 is a review copy; required YouTube/Vimeo publication awaits account access. Older real-headset footage requirement remains separately H4. |
| C48 | Cyclone policy file | 🟨 | `policy/cyclone.json` in the documented bundle format; provisioning ⛔ H1. |
| C49 | Recorded real dossiers for demo | ⛔ | Pipeline + check script built; needs an H1 live run. |
| C50 | Demo records in proof-bundle shape | ✅ | Actual Receipt → Proof → Export proof produces proof-bundle 2.0 plus public demo JWKS. Installed public CLI verifies the export (exit 0); tampering fails (exit 1). Local key is explicitly not an official trust anchor. No private key is exported. |
