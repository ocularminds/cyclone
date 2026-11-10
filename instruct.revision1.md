# Codex implementation instructions: technical review revision 1

Date: 10 November 2026  
Repository: `/Users/bonus/develop/products/Cyclone`  
Objective: close the technical and product-logic findings in the review, integrate the design's truthful interaction states, and produce a defensible competition build.

When asked to execute this guide, reproduce the current defects, implement the fixes and verify their behaviour. Work on the existing application, relay and scripted agent. Do not substitute a plan or a polished mockup for functioning code.

## 1. Required references and authority

| Reference | How to use it |
|---|---|
| [brief.revision1.pdf](/Users/bonus/develop/products/Cyclone/brief.revision1.pdf) | Primary review: G01-G06 p.4, G07-G11 p.5, all unresolved capability groups p.6, feature priorities p.7, acceptance plan p.8, submission corrections p.9 and verification limitations p.10. |
| [brief.design1.pdf](/Users/bonus/develop/products/Cyclone/brief.design1.pdf) | Required companion: controls p.5, bounded forms p.6, access/geometry p.7, evidence and permission language p.8, implementation handoff p.9. |
| [instruct.design.md](/Users/bonus/develop/products/Cyclone/instruct.design.md) | Visual implementation and ownership of the settings repair, typography, controls and access presentation. |
| [design guide](/Users/bonus/develop/products/Cyclone/design/brand1/GUIDE.md) | Detailed UX/state requirements and explicit limits of the example prototype. |

The requested `brief.revision1.pdf` is byte-identical to the existing `brief.review1.pdf`. Its baseline is the 10 November 2026 review, not proof that the current checkout still has every defect. Recheck before changing code.

Read root/scoped `AGENTS.md`, `brief.submission.v2.md`, `CAPABILITIES.md`, `DECISIONS.md`, `docs/agentsafe.md`, the three package manifests and the current diff. Paths below are relative to the root. For app implementation invoke `app/.agents/skills/iwsdk-dev/SKILL.md` and its applicable specialists. Read current official service/spec documentation before using an endpoint or verification format.

Keep human instructions and the project's actual policy requirements authoritative. Preserve all registered capabilities. Log conflicts with stale assumptions, including live amendment support, overnight intents, access labels and test claims. Do not restore or overwrite unrelated work.

## 2. Work boundaries and sequence

Use the existing IWSDK/TypeScript/ECS stack. Keep the demo independent of credentials and live availability. Keep `@decionis/verify` on the server/test side and out of the headset bundle. Import runtime Three.js APIs from `@iwsdk/core`.

Priority order:

1. R0 baseline; design D1 fixes G01's unusable settings geometry.
2. R1 fixes action/proof association and execution gating before any new verified-decision claim.
3. R2 fixes retained rehearsal evidence; R3 fixes scoring and delegation.
4. R4 fixes routing, input truth and physical bounds, coordinated with design D2-D5.
5. R5 resolves conformance and supported live integration; R6 supplies performance, scenario and submission evidence.

Correctness fixes and evidence take precedence over extra scenarios, multiplayer, voice or decorative AI chat. Implement the original/amended comparison only after the critical baseline is sound. Preserve existing capability scope; mark optional additions explicitly deferred if they threaten required testing.

This file does not itself authorize contest submission, messages to third parties, paid services or real machine operation. Use existing human authorization, ask only for genuinely missing external inputs, and continue independent local/demo work while those are pending. Do not print credentials or check secrets into fixtures.

## 3. R0 — Reproduce and record the baseline

The review observed 50 app tests and 46 relay tests passing, plus an app build and a four-request agent dry run. A separate verifier CLI check failed `policy-projection.json`. Those counts and outcomes are historical; rerun the applicable checks and report current results.

| Working directory | Commands, run individually |
|---|---|
| `app/` | `npm run typecheck`; `npm test`; `npm run build` |
| `relay/` | `npm run typecheck`; `npm test`; `npx --no-install @decionis/verify intent src/fixtures/vectors` |
| `agent/` | `npm run typecheck`; `npm run dry` |

Inspect existing test harnesses and use fixtures/mocks for reproducible failures. A mock reproduction is not a production exploit. Do not require a service account to fix local logic. Record commit, environment and every known failing check under `docs/revision1/`.

## 4. R1 — Bind proof to the action and gate execution — G07/G08, P0

Starting files: `relay/src/verify.ts`, `relay/src/seal.ts`, `relay/src/decide.ts`, `relay/src/store.ts`, `relay/src/hub.ts`, `app/src/contracts/intent.ts`, `app/src/adapters/live.ts`, `app/src/flow/shift.ts`, `app/src/systems/twin.ts`, and related tests.

### R1a. Associate the signed evidence with the intended decision

The current verifier checks signatures, required coverage, trusted key source and optionally dossier ID. The review's mocked run accepted a valid fixture that contained neither the held intent ID nor held hash. An outer wrapper populated with the expected action does not prove the signed payload covers that action.

Introduce an explicit expected-decision/binding context at the verification boundary. Derive it from the relay's authoritative held intent and validated decision, never a client assertion of `verified`.

Using the supported proof profile and verified artifact paths, establish the exact intended action, intent association, decision kind and relevant original/amended binding. Validate amended arguments and their hash as a distinct mutation. Require signature-covered evidence, or the profile's documented equivalent association; string-searching the JSON or matching an unsigned wrapper is insufficient. Preserve signature, required-coverage, trust-anchor, issuer and scope checks.

If the available proof format cannot establish that association, keep the record unverified and execution-ineligible, expose a precise reason, and document the service/profile dependency. Never invent a signed field or pretend the policy service signed local rehearsal data.

Regression cases: valid matching action; unrelated valid dossier; wrong dossier; right dossier/wrong intent; wrong original hash; amended hash or argument mismatch; wrong signed decision; unsigned/missing association; missing coverage; wrong/unavailable keys; tampered signature. Successful fixtures must genuinely cover the claimed binding under the test key/profile.

### R1b. Separate resolution from proof and execution

The review also returned `APPROVE` with `verified: false`, stored `resolved`, and allowed the twin's approval animation. Introduce explicit, independently represented authorization, proof-verification and execution-eligibility/result states. Adapt existing types and migrations rather than blindly adopting new field names from a mockup.

- An already-resolved upstream authorization remains an authoritative fact even if proof retrieval fails. Do not reset it to held and blindly request approval again.
- Pending, failed, mismatched, uncovered or untrusted proof must not enable execution or a success animation that implies execution.
- Recovery retries retrieval/verification of the same record safely; it does not replay an action. Preserve idempotency for duplicate decisions, WebSocket events, reloads and late results.
- Reject expired or changed bindings at the authoritative decision boundary. Edits and expiry during a hold must invalidate that commitment.
- Keep demo signature and simulated execution explicitly separate from live proof and an actual execution receipt. This project currently has no physical actuator integration.
- Follow design brief p.8: Held for review; Decision sent; Checking decision record; Signature checked; Record could not be verified; Demo signature; Execution confirmed only with an observed result.

Acceptance: a mock approval with invalid/missing proof never emits an execution-eligible event or completed-action animation; verified matching proof permits only the documented subsequent step; proof failure/retry cannot cause duplicate execution; UI, stored state and broadcasts agree. Test stale updates and reloads, not just a returned boolean.

## 5. R2 — Preserve the reviewed rehearsal — G09

Starting files: `app/src/sim/rehearsal.ts`, `app/src/sim/kinematics.ts`, `app/src/sim/envelope.ts`, `app/src/contracts/intent.ts`, `app/src/core/signer.ts`, `app/src/state/ledger.ts`, `app/src/systems/seal.ts`, demo/live adapters and relay sealing/export paths.

The existing reference hashes action arguments without model/scene identity; pickup recomputes with the current model. The review changed arm braking deceleration, changed the breach result and retained the same reference.

Implement a versioned, immutable rehearsal snapshot or content-addressed object that remains resolvable after reload. It must preserve enough information to reproduce what was reviewed: original/amended binding, starting state, model/version and relevant parameters, scene/zone geometry, units and timing, reviewed samples/trajectory, and the breach/affected-asset result.

Define a separate, documented local rehearsal digest. It must not replace or masquerade as the Agent-Safe Intent v1 action hash. Bind the snapshot to the local decision record; link external authority evidence only to claims it actually covers. Explain that distinction in receipt detail.

Replay stored original evidence by default. A later what-if replay is a separately labelled result. Migrate legacy records without deleting them or falsely certifying their history; show that the original model/evidence was not retained when exact replay is impossible. Handle corrupt records and unavailable storage without breaking the current session.

Acceptance: later model/zone/parameter changes do not change the original replay; relevant snapshot changes alter its digest; tampering is detected; a different action's proof cannot validate the record; reload preserves samples and identifiers; legacy records remain accessible with honest scope. Test the original-versus-amended view against the same model and starting state.

## 6. R3 — Correct scoring and bounded delegation — G10/G11

### R3a. Calibration and drills

Starting files: `app/src/flow/shift.ts`, `app/src/state/calibration.ts`, drill/HUD systems and `app/tests/shift.test.ts`.

The review's expired drill produced `REJECT / expired / timeout` and “100% caught (1/1).” Replace the generic non-approval-equals-catch test with explicit outcomes. At minimum, distinguish a deliberate correct veto, unsafe approval, timeout/miss, unresolved escalation, and unnecessary veto of an otherwise permissible non-drill proposal. If an amendment prevents a breach, classify that correction explicitly rather than assuming every non-approval is a catch.

Specify denominator rules and migrate persisted scores honestly. A timeout never increases the caught numerator; a zero assessed denominator displays no score rather than an invented percentage. Do not leak a drill label before the decision. Keep false alarms separate so repeated blanket rejection does not imply excellent calibration.

Acceptance: timeout, correct veto, unsafe approval, unresolved escalation, amended outcome, non-drill false alarm and zero-denominator cases have deliberate tested results; HUD/summary/history agree with the event log; reload preserves the corrected semantics.

### R3b. Rule acceptance, scope and revocation

Starting files: `app/src/state/trust.ts`, `app/src/contracts/scenario.ts`, `app/src/systems/trust.ts`, `app/src/flow/shift.ts`, scenario rule data and relevant tests.

The review accepted an unoffered rule and matched a high-risk -100% conveyor proposal against an upper-limit-only rule. Require an actual outstanding offer for the correct agent, validate the complete rule, and retain explicit offer/accepted/expired/revoked state.

Match agent, tool, asset, parameter and units, allowed risk, required approval mode, finite lower/upper bounds, expiry and revocation. Missing or malformed information fails to match. Continue excluding drills. Reject NaN/infinity and inappropriate negative values. For the example, allow only routine single-approval conveyor increases within 0% to +5%, for the offered asset and lifetime.

Re-evaluate queued but undispatched proposals when a rule is accepted, changed, expires or is revoked. Do not imply revocation undoes a completed action. Version persisted rule data; old broad grants must not silently inherit unlimited authority. Treat three clean approvals as a progression mechanic, not statistical proof of safety.

Preserve the relay's current refusal of live `AUTO_APPROVE_RULE`. Do not remove that guard to make the demo form appear live. A future live delegation needs a supported policy/authority implementation and its own evidence.

Acceptance: unoffered/wrong-agent/wrong-asset/high-risk/non-single/drill/out-of-range/non-finite/expired/revoked proposals never auto-resolve; valid in-scope demo proposals retain the intended behaviour; revocation affects pending work; persisted legacy data is safe. Design D5 consumes these actual states.

## 7. R4 — Repair onboarding, input truth and spatial bounds — G02-G04

Starting files: `app/src/app.ts`, `app/src/flow/shift.ts`, `app/src/state/session.ts`, `app/src/state/store.ts`, card/gesture/settings/twin systems, `app/src/models/layout.ts`.

- Persist first-shift completion separately from launch/visit count. Until completion, expose resume/restart; do not select handover solely because an interrupted visit exists. Preserve scenario overrides, deterministic capture and storage-denied operation.
- Verify actual platform input sources and the head-directed fallback. Correct “Eyes-only” labels and claims when a pinch is required. Dwell must not authorize an action.
- Cancel or freeze-then-cancel commitment progress correctly on input loss, intentional release, hidden session, expiry and action mutation. Do not auto-resume an interrupted commitment.
- Preserve the existing plane-edge distance check, then add full board-fit and dynamic-control checks. Do not claim that checking a nearby edge proves a 60 × 40 cm board fits a small/rotated table.
- Include card, dial, timeline, settings, ledger and interaction extents in reach/FoV checks based on actual world-space head position. Reflow/reposition or choose the plinth rather than placing controls outside the seated envelope.
- Keep demo pause semantics separate from live wall-clock expiry. A live expired intent cannot be revived by headset pause or reload.

Acceptance: first launch, early exit, refresh, completion, return visit, reset and blocked storage route correctly. Test small/rotated/side tables, no table, different seated positions and all input paths. Design D1 owns actual settings sizing; design D4 owns its access presentation. Verify real runtime behaviour, not only static geometry constants.

## 8. R5 — Conformance and honest live capabilities

### R5a. Intent hash conformance — C13

Reproduce the installed verifier's failure against `relay/src/fixtures/vectors/policy-projection.json`. Record package version, corpus provenance and expected profile version. Reconcile supported verifier/spec versions using published documentation and compatible dependency changes where justified.

Do not delete the failing vector, relax validation merely to pass, or replace Agent-Safe Intent v1 with a local hash. Preserve browser/reference parity, mutation vectors, canonicalization edge cases and published CLI conformance as separate checks. Run the existing CLI over the full fixture directory after any correction; a unit parity pass alone is insufficient. If an upstream incompatibility remains, retain it as a specific dependency with evidence.

### R5b. Live integration — C12/C35/C36/C39/C48/C49

Inspect `relay/src/decide.ts`, upstream/capabilities/policy/recording code, `policy/`, `agent/` and `docs/agentsafe.md`.

The current amended-approval branch ends unsupported even with its flag enabled. Treat this as an implementation/API-contract gap as well as a provisioning dependency. Implement a route only when supported by the actual documented service. Otherwise advertise the capability as unavailable and retain the counter-offer/new-proposal path with a fresh binding. Do not guess endpoints, payloads or attestations.

Preserve authentication, authoritative binding validation, expiry, idempotency and meaningful refusal states. Keep capabilities conservative when the service is unreachable. A live intent's documented short TTL means handover presents current actionable proposals; historical overnight activity may be shown separately, with re-proposal/revalidation when needed.

With authorized access, capture a genuine held intent, corresponding decision, correctly bound signed dossier and refusal cases. Export permitted public proof artifacts without credentials or private keys. Local fixtures remain labelled fixtures; never change a fixture's issuer or trust-source label to claim a production run. Without access, complete local fixes and report the exact H1 dependency.

C50's common proof-bundle format remains a time-boxed registered item. Preserve it in the register; do not let format expansion displace launchability, correctness or the video.

## 9. R6 — Evidence, performance and submission truth — G05/G06

Close the review's remaining capability groups with concrete checks:

| Group | Evidence required |
|---|---|
| C01/C02/C24/C28 | Correct tether target and spatial source; full-rationale interaction; complete cue/caption mapping; audible review. |
| C14/C19 | First-shift completion and timing; interrupted onboarding; real settings reset; storage-denied behaviour. |
| C07/C20/C21/C22 | Actual desk-edge veto; board fit; anchoring/fallback; dynamic reach and narrow-FoV evidence. |
| C11 | Historical reload-and-replay using the immutable evidence. |
| C30/C31/C40 | Final visual hierarchy and settings operation; device cold start and sustained frame timing. |
| C47 | A finished public video under three minutes, with accurate footage and claims. |

The historical 29.9k triangles, 226 draw calls and desktop/emulator frame rate are not device results. Profile the production build on Quest 3/3S through a complete first shift, including hands, settings, amendments and replay. Meet 60 fps, target 72 fps, retain ≤60k triangles and one active transparent ghost. Inspect the build's large main chunk and measure cold start before choosing optimizations. Record device, OS, build, room and frame-time evidence; do not remove required behaviour to improve a benchmark.

Run relevant unit/relay tests and existing hands-mode scenarios after affected logic changes. Use editor rendering only for appearance; runtime/immersive checks prove interactions. Keep failure evidence and regression tests meaningful. Do not repeatedly rerun unrelated suites after a clean, unchanged result.

Correct `README.md`, `SUBMISSION.md`, `VIDEO.md` and capability claims: menus/settings exist; gaze-plus-pinch is not hands-free; device readiness requires evidence; live amendments and exact history require working implementations; live actions are not held indefinitely overnight. Reopen stale green entries where necessary, including scoring, trust, access and submission copy.

The review lists 23 unresolved capability rows: C01, C02, C07, C11, C12, C13, C14, C19, C20, C21, C22, C24, C28, C30, C31, C35, C36, C39, C40, C47, C48, C49 and C50. Keep each accounted for even when evidence is grouped.

Prepare a concise real-workflow recording, an unfamiliar-user first-shift check and clean-device judge access. Emulator footage is permitted by the reviewed competition rules; the repository's H4 is stricter. Label the actual evidence used and resolve that discrepancy explicitly. Never substitute cover art or the design studio for footage of completed functionality.

Check the current execution date and competition state. The project freeze is 17 November 2026; the reviewed deadline is 18 November at 21:00 Stockholm time. Preserve the submitted hosted build during the required availability period. Membership, launch date and final entry submission remain owner/account facts; do not invent confirmation.

## 10. Acceptance and final report

Save evidence under `docs/revision1/`, with commit/build identifiers, commands/results, regression cases and explicit mock/emulator/device/live labels. Link design evidence from `docs/design1/` rather than duplicating it. Update `CAPABILITIES.md` and append interpretations to `DECISIONS.md` as checks are completed.

Required closure:

- G07/G08: exact signed binding association and conservative execution gating, including retry/idempotency cases.
- G09: immutable history, tamper/migration tests and honest legacy handling.
- G10/G11: corrected drill outcomes and genuinely bounded/revocable demo rules; live refusal preserved.
- G01-G06: integrated settings, onboarding, input labels, readable card, full spatial bounds and appropriate device evidence.
- C13: actual CLI conformance success, or a retained, precisely evidenced upstream dependency; never silently call parity a conformance pass.
- Live, video, device and account dependencies have a working local fallback where applicable and a clear owner requirement. Incomplete required work remains incomplete.

Follow the existing milestone commit convention for task-owned implementation changes. Final response must state what changed, the findings closed, current test/conformance outcomes, device/live evidence actually obtained, remaining blockers, capability counts and deployment/submission status. Report the result honestly even when some dependencies remain unresolved.
