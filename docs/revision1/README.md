# Technical revision 1 — evidence and remaining work

Executed 10 November 2026 against `instruct.revision1.md`, with `brief.revision1.pdf` and the design companion.
The default branch is `main`; there is no remote `master`. Baseline was `d0861af`. The isolated task incorporated
the reference-kit commit `3448f36`, then fast-forwarded to the identical tree at upstream `5a4594d`. Final code,
deployment and asset identifiers are in [release.json](release.json); [build.json](build.json) hashes shipped files.

**Current register: 35 verified, 14 partial, 1 human-blocked, 0 todo. All 50 IDs remain.** Local correctness and
emulator work is complete. Genuine live dossiers, physical-device acceptance, unfamiliar-user/listening checks,
the stricter physical-headset recording requirement and owner submission facts remain [explicit dependencies](human-checks.md).

## Findings and implementation

| Review / guide | Result and evidence |
|---|---|
| R0 baseline | Reproduced current commands rather than adopting the review's old counts: 68 app / 46 relay tests; build, typechecks and four-request dry run passed. CLI policy projection failed. [Original results](baseline.json); [failing regression reproduction](regressions-before-fix.json). |
| G07 / R1a | Relay verifies the actual signature-covered action digest, decision/dossier/evaluation IDs, target, expiry and authority under the published profile. Rehashes the authoritative held binding and validates amendments distinctly. Wrong/unsigned/missing association stays unverified with a specific reason. `relay/tests/association.test.ts` uses genuinely signed fixture artifacts, not unsigned matching wrappers. |
| G08 / R1b | Authorization, proof and execution are independent. Persist a dispatch attempt and known upstream outcome before proof retrieval. Restart, late events and retries converge by record ID/revision. Unknown outcomes cannot be re-approved; proof recovery never calls grant again. Invalid/corrupt state fails closed. No live record drives a physical-execution animation. `recovery.test.ts`, `revision.test.ts`, client `live.test.ts`, and actual UI Retry check verify this. |
| G09 / R2 | Validate immutable `cyclone.rehearsal/1` evidence, separate digest, model/scene/units/samples and exact action links. Preserve local evidence across proof updates. Legacy history is labelled unavailable; corrupt/tampered entries cannot replay as original. [24/24 receipt checks](e2e-receipts.json) include reload, changed model, original/amended path equality and tampering. |
| G10 / R3 | Preserve the design's deliberate drill outcomes, strengthen corrupt-score migration and verify through actual flow: timeout is a miss, veto/safe correction catches, unresolved escalation unassessed, false alarms separate. Zero assessed denominator has no percentage. These cases are in app revision/design/shift tests. |
| G11 / R3 | Version 3 rules retain their complete offered scope and expiry. Unoffered, altered, malformed, broad legacy, wrong-asset/agent/unit, out-of-range/non-finite and revoked inputs cannot auto-resolve. All fixed arguments match, including conveyor line 1. Recheck before dispatch. [Hands acceptance/revocation](e2e-extras.json); live `AUTO_APPROVE_RULE` remains refused. |
| G01–G03 / R4 | Existing design fixes were already present: bounded paged settings, completion-based onboarding, accurate Gaze + pinch labels, and cancellable holds. Preserved them and reran affected hand paths. [Design UI evidence](../design1/README.md) remains 118/118; revision UI adds live proof recovery and translated-head pages. |
| G04 / R4 | Exact polygon containment replaces sampled board fit, including a narrow concave notch. Full board/station/interaction volumes fit; panels re-place after seated translation; rail/dial move as a bounded cluster. Actual world geometry passes at both text sizes. Native anchoring and Quest FoV remain H3. |
| G05 / R6 | Audited bundle and measured clean local production start and desktop frame times. Sustained Quest evidence remains H3; desktop results do not close this finding. |
| G06 / R4–R6 | Preserved the design reading hierarchy, named rationale/amend/compare controls and dedicated caption row. Actual settings/action/receipt pages pass geometry and visual checks, including seated translation. Human/device legibility and unfamiliar-user checks remain open. The finished video demonstrates these actual controls. |

## Checks actually run

[Validation results](validation.json) record commands and outcomes. [Initial run](validation-initial.json) keeps
the protocol-string branding failure; the exact machine-key exception then passed its focused audit and all
81 app tests in the final rerun. Relay tests were not repeated after unchanged green results.

| Check | Outcome | Evidence kind |
|---|---|---|
| App / relay / agent typecheck | All exit 0 | Local TypeScript |
| App Vitest | **81/81**, 9 files | Logic, state, parity and adapter tests |
| Relay Vitest | **70/70** | Local HTTP/WS and generated signed fixtures; no production service |
| Agent `npm run dry` | Four documented proposals | Dry run only; no API invocation |
| Production build | Pass; final includes finished MP4 | [Build output](build.txt), [module attribution](bundle.json) |
| First shift | **27/27**, emulated hands only | [Normal run](e2e-onboarding.json), [recorded take](video/e2e-onboarding.json) |
| Alternative paths | **14/14** | [Escalation, one-hand, gaze/pinch, veto, pause, drill, rules](e2e-extras.json) |
| Historical receipts | **24/24** | [Runtime path equality, reload/model change, tamper/legacy](e2e-receipts.json) |
| Revision UI | **17/17** | [Hand-selected export/retry, head translation at 125%](revision-ui.json). Live record is an injected test fixture; recovery calls 1, approval calls 0. |
| Spatial geometry | **6/6** | [Actual world-space vertices](spatial-bounds.json), max reach 0.606433 m; no interactable behind head. |
| Plane selection | **6/6** | [Runtime ECS fixtures](plane-fixtures.json) inject the selection boundary. Native plane/anchor APIs and real-room fit were not tested. |
| Sensory | **33/33** | [Audio graph / tether / caption checks](sensory.json). Four machine panners and voices; 13 individually injected cue events. Human audible review remains open. |
| Static production | **11/11** | [Fresh Chromium context](production.json); backend blocked, SDK static models allowed, four decisions and valid snapshots/demo proofs. |
| Public deployment | **Pass** | [Fresh public browser](public-result.json): XR, first token 6.02 s, retained receipt and proof-bundle 2.0, no page/request errors. [Public JS/MP4 hashes](public-assets.json) equal local output. |
| Capture | **6/6** | [Fixed hashes and clean four-seal end card](e2e-capture.json) |
| Visual | No blocking clipping/overlap found | [Single runtime contact sheet](ui-runtime-review.jpg), [review scope](visual-review.json); device legibility not established. |

Recorded hands timing: first token **6 s**, first seal **25.5 s**, satisfying moment **28.3 s**, summary **176 s**.
Automation speed is not evidence of an unfamiliar user's five-minute shift. Clean local production navigation
reaches the first token in **7.311 s**. Desktop IWER: **60.002 fps / p95 16.9 ms** over 480 frames, **30,312
triangles**, **276 draw calls**, one active ghost. See [performance limits](../perf.md); no Quest is connected.

## Hash conformance and public proof format

Pinned source: public `decionis/agent-safe-pipeline` at `eed5299bb19510476735cc90fedca9aaae4dee4e`.
[Source provenance](sources.json) records exact current documentation URLs and hashes; [corpus manifest](corpus.json)
covers all 16 Intent-profile files, including the new `array-index-keys.json` and four framework vectors.
Existing files remain byte-identical. Current npm latest is `@decionis/verify` **0.5.0**.

```bash
cd relay
npx --no-install @decionis/verify intent src/fixtures/vectors src/fixtures/vectors/frameworks
```

**15 reproduced, 1 failed, exit 1.** `policy-projection.json` fails the verifier's supported binding-shape check
at `policy_projection.channel`. [Raw CLI output](conformance.txt) is retained. Browser/reference hashing parity
passes independently for scenarios, all corpus vectors, mutations and edge cases. No vector was removed and no
validator was relaxed. This precise upstream compatibility issue keeps C13 partial.

C50 is implemented within the time box: the actual **Receipt → Proof → Export proof** control downloads the
public proof-bundle 2.0 dossier and local JWKS. [Actual exported dossier](demo-dossier.json) and
[demo JWKS](demo-jwks.json) pass the installed public CLI (exit 0). The relay test's tampered export exits 1.
The trust source remains a local demo key, not an official issuer. Exports contain no private signing key.

## Delivery and remaining acceptance

[Public app](https://ocularminds.github.io/cyclone/) ·
[published YouTube video](https://youtu.be/NaKl8JTSMP4) ·
[shot list and claims](../../VIDEO.md) · [edit/source provenance](video/edit.json).

The finished video is actual IWER footage, edited at normal speed and permanently labelled as emulated input
and simulated execution. It is now [public on YouTube](https://youtu.be/NaKl8JTSMP4); publication and 720p playback are
verified in [the upload record](video/youtube.json), with a [confirmation screenshot](video/youtube-published.jpg).
This closes the video-platform publication dependency. AGENTS H4's stricter real-headset recording remains open separately.

H1 availability checks found no configured live credentials, registered key or policy. C49 therefore contains
no invented real dossiers. The public docs still provide no implemented amendment route; capability is always
false, even if an obsolete flag is set. Current live holds expire under the documented short TTL; historical
overnight records never revive authority. [Integration contract](../agentsafe.md) documents the exact dependency.

All review-listed unresolved IDs remain accounted for in [CAPABILITIES.md](../../CAPABILITIES.md). The 14 partial
rows are C07, C12, C13, C14, C20, C21, C22, C24, C35, C36, C39, C40, C47 and C48; C49 is blocked on H1.
H2 membership/final submission and H6 launch confirmation remain owner facts. No contest entry was submitted.
Checked deadline: **18 November 2026, 21:00 Stockholm**, with repository freeze **17 November** and submitted
site availability through the winner announcement around **11 December**.
