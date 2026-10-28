# AGENTS.md — Cyclone build instructions (for Claude Code / Codex)

> **Source of truth:** `brief.submission.v2.md` (referred to below as **BRIEF §n**).
> This file turns the brief into executable work. If this file and the brief disagree, the brief wins — log the conflict in `DECISIONS.md` and follow the brief.
> **Do not drop, merge away, or silently simplify any capability in the Capability Register (§3).** Every ID must end as ✅ built + verified, or as an explicit, logged blocker that only a human can clear.

---

## 0. Mission

Build **Cyclone**: a hands-first, Meta VR Glasses-first WebXR app (IWSDK 1.0) in which every high-stakes action an AI agent tries to take in the physical world appears on the user's real desk as a token. The user inspects it with gaze, rehearses its outcome with a ghost simulation, amends it with their hands, decides with a physical gesture, and seals the decision as a signed record bound to exactly what they saw.

Submission target: Meta VR Start Developer Competition 2026 · Productivity · New Experience.
**Hard deadline: 18 Nov 2026 12:00 PT (21:00 Stockholm). Code freeze: 17 Nov.**

---

## 1. Operating rules for the agent

1. **Work autonomously.** Don't stop to ask unless you hit a blocker listed in §11 (Human-only items). For anything else, choose the option most consistent with the brief, record it in `DECISIONS.md` (date, decision, alternatives, brief section), and continue.
2. **Never guess IWSDK APIs.** Scaffold with `npm create @iwsdk@latest` (choose *mixed reality*, select your coding agent). Use the project's bundled IWSDK MCP server and agent skills (and `iwsdk.dev/skill.md`) to look up real APIs, inspect the running scene, drive emulated headset/hands, and test. If an API you need doesn't exist, log it and build the smallest custom system that achieves the capability.
3. **Never invent Decionis/AgentSafe endpoints or formats.** The held-intent webhook format and the resolve endpoint are documented (see §6.5 for where to find them and what is already confirmed). Read the docs and implement exactly what they say; all AgentSafe traffic goes through the one adapter interface (§6.1). Only credentials and the provisioned policy come from a human (H1). Demo mode must never depend on the live adapter.
4. **Demo mode first, always green.** Judges open demo mode. It must run with no backend, no login, no network beyond static assets.
5. **Commit per milestone** with message `M<n>: <summary>`. Keep `main` deployable from M2 onward.
6. **Tick the register as you go.** Maintain `CAPABILITIES.md` (copy of §3 with a Status column: ⬜ todo / 🟨 partial / ✅ verified / ⛔ blocked + reason). Never mark ✅ without running its acceptance check.
7. **Efficiency:** implement shared foundations once (§5 data contracts, §6 systems), then layer capabilities. Prefer deterministic, data-driven behaviour (scenario JSON) over hard-coded scenes.

---

## 2. Non-negotiables (from BRIEF §1, §11, Appendix)

- **Stack:** IWSDK 1.0 (Three.js + ECS), TypeScript, Vite. **No React Three Fiber / `@react-three/xr`.**
- **Hands-first:** the entire experience completes with hands only; never require a controller. Controllers may work but no path depends on them.
- **Gaze + pinch enabled** (IWSDK's one-line VR Glasses config) and the app must still work on Quest 3/3S.
- **Seated:** every interaction within 2 ft (0.61 m) of the seated user; nothing behind them; no standing or walking. No "walk onto the factory floor".
- **No biometric approval** of any kind. Approval is gestural (§3 C05–C09).
- **No corporate branding in the app or in-app text** — no Decionis/AgentSafe logos, wordmarks or slogans; the in-app term is **"policy gate"**. Decionis is named only in README/SUBMISSION "How we built it".
- **No human figures or identifiable people.** Walkways are floor markings.
- **English** for all text; captions for all audio cues.
- **Honesty:** the ghost is always called a **rehearsal** from the twin's kinematic model — never a "prediction" or "guarantee". Demo physical execution is simulated, and the UI/README say so.
- **Fail closed** for physical actions: an unresolved intent never executes; an expired intent auto-rejects.
- **All Cyclone code is new** (written after 24 Sep 2026). Use Decionis only as an external service/package; do not copy pre-existing Decionis UI code.
- **Performance:** ≥60 fps on Quest 3/3S (target 72); ≤60k triangles; instanced machines; baked lighting; one transparent ghost pass.
- **Approvals are resolve calls bound to an intent hash** (not "a 200 OK back to AgentSafe").
- **Hashes follow Agent-Safe Intent v1 (`agent-safe.intent/1`).** Never a home-grown hashing scheme; client reproduction must match `intentHash()` from `@decionis/verify` byte for byte.
- **`@decionis/verify` runs server-side only.** It imports Node built-ins (`crypto`, `https`, `dns/promises`, `net`, `stream`) and will not bundle for the headset browser. Never import it into `app/`.

---

## 3. Capability Register (complete — nothing may be dropped)

Each row: ID · capability · BRIEF ref · acceptance check (how you prove it). Use IWSDK's emulator/MCP to drive hands and gaze for checks, plus unit tests where noted.

### Core loop — Intercept → Rehearse → Decide → Seal (BRIEF §3, §9)
| ID | Capability | Ref | Acceptance check |
|---|---|---|---|
| C01 | **Intercept:** a held intent spawns a glowing token that drops into the **holding tray** on the desk; a **light thread** tethers it to its target asset; the asset **hums from its position** (spatial audio) | §3.1, §9 | Emit a scenario intent → token appears in tray within 1 s, thread connects to correct asset_id, positional audio source sits on the asset |
| C02 | **Inspect:** looking at the token lifts and unfolds a **card in the central view** showing agent (with **sigil**), **one-line rationale**, **rule that tripped**, **blast radius**; a **second pinch shows full rationale** | §3.2, §9 | Gaze at token → card opens; pinch → full rationale; card inside FoV target (C21) |
| C03 | **Rehearse:** pinch the **timeline handle** and pull toward you to **scrub** a translucent **ghost** of the machine along its path; the **exact breach point flares** | §3.3 | Scrub 0→100% → ghost pose follows; breach flare appears at the computed envelope-crossing point for arm @250°/s |
| C04 | **Amend:** grab and **twist the parameter dial** (e.g. 250→180); the ghost **re-rehearses live**; breach **clears** when within envelope | §3.4 | Rotate dial → args update continuously, ghost recomputes each change, flare gone at ≤ safe value |
| C05 | **Decide — single:** place the token in the **execute slot** (policy.requires = `single`) | §3.5 | Grab-place in slot → decision APPROVE sent with matching hash |
| C06 | **Decide — dead-man's hold:** for `two_hand`, both palms on the token for **1.5 s** while the ghost **replays at real speed**; **releasing either hand aborts** | §3.5 | Hold 1.5 s → APPROVE; release at 1.0 s → no decision, token returns |
| C07 | **Veto:** **push the token off the real desk edge** into the **veto chute** | §3.5, §6 | Push past edge → REJECT; works on detected desk and on fallback plinth edge |
| C08 | **Forbidden:** for `forbidden`, the **execute slot locks**; only veto or escalate are possible | §3.5 | Placing in slot is refused with visible/audible lock; veto & escalate still work |
| C09 | **Escalate:** an **escalate pad** next to the slot; placing a token there sends ESCALATE (intent stays held, flagged for a second reviewer) | §3.5 | Place on pad → ESCALATE recorded; token parks in an "escalated" rack. *(Brief names escalate without defining it; this is the minimal interpretation — log in DECISIONS.md)* |
| C10 | **Seal:** each decision becomes a **signed record** shown as a **seal crystal** stamped with a **glyph derived from the intent hash** — the **same glyph shown on the token** — that lands on the **ledger shelf** | §3.6, §9 | Glyph(token) === glyph(seal) for every decision; record signature verifies (C13) |
| C11 | **Ledger replay:** pick up any seal to **replay the rehearsal** that was seen at decision time | §3.6, §5 | Grab seal → ghost replays stored args/path; works after reload (C19) |
| C12 | **Amend semantics, both paths:** live AgentSafe **supports approve-with-changed-arguments** under the provisioned policy, so the live adapter reports `supportsAmendedApproval = true` and sends APPROVE_AMENDED with amended args; AgentSafe re-evaluates the amended call against the policy and signs the result. If the policy **denies** the amended values, show the denial on the token (it stays held) and offer the counter-offer path. The counter-offer path (REJECT with `{suggested:{…}}`, agent re-proposes a new token within limits) is **kept** for policies that don't allow amendment and for demo mode | §3 note | Unit + e2e for both flag values; live: amended 180°/s approved and signed; live: amended value outside policy → denial shown, token still held; demo: scripted agent re-proposes 180°/s when flag is false |
| C13 | **What you see is what you sign:** `intent_hash` is the **Agent-Safe Intent v1** hash of the action binding, as delivered in the held-intent webhook. The client reproduces it from the binding it rehearsed (browser port of the profile's canonicalization) and sends it with the decision; an amended call is a **distinct mutation** with its own `amended_hash`. Relay/AgentSafe **refuse any decision whose hash ≠ the held intent**; the signed record carries the hash | §8 | Parity tests: browser port == `intentHash()` from `@decionis/verify` for every scenario binding **and** every vector in the published conformance corpus (`npx @decionis/verify intent <vectors>` exit 0); amended hash differs from base; tamper test → refusal |

### First five minutes (BRIEF §4)
| ID | Capability | Ref | Acceptance check |
|---|---|---|---|
| C14 | Scripted onboarding with **no text walls**: twin **blooms** on the table at entry; token 1 **glows until looked at**, **pinch hint pulses once**; token 2 **timeline handle wiggles**, then **dial wiggles**; token 3 shows the **slot lock**; token 4 is the **drill**; ends with **shift summary**. Timings: **first token ≤15 s**, **satisfying moment ≤90 s**, **full shift ≈5 min** | §4 | Run onboarding in emulator with timestamps logged; all beats fire in order; timing targets met |

### Reason to come back (BRIEF §5)
| ID | Capability | Ref | Acceptance check |
|---|---|---|---|
| C15 | **Shift handover:** daily mode that presents the **overnight held queue**; cold start to first token ≤15 s | §5 | Launch → "handover" queue loads from scenario/live; first token ≤15 s |
| C16 | **Drills:** occasionally inject a plausible but unsafe intent; **reveal "Drill" only after the user decides**; on a miss, **ghost replays the clip**; **calibration score = catch rate** | §5, §4 | Drill never labelled before decision; approve → "Drill — you missed it" + replay; score updates correctly (unit-tested) |
| C17 | **Agent trust rings:** each agent's ring **fills as proposals pass without amendment**; at threshold Cyclone **offers a rule** (e.g. "auto-execute conveyor changes under +5%"); user **grabs the rule and drops it on the agent** to accept; matching future intents then **auto-execute and auto-seal** — the desk gets quieter | §5 | Unit: ring math; e2e: reach threshold → rule object spawns → drop on agent → next matching intent auto-seals without a token |
| C18 | **Shift summary:** counts of decisions, amended, vetoed, drills missed; trust rings shown | §4 | Values match the session's event log |
| C19 | **Persistence across sessions:** seals/ledger, trust, rules, calibration score survive reload (localStorage/IndexedDB wrapped in try/catch; app works if storage is unavailable); a **reset** control exists | §5 | Reload → state restored; storage blocked → app still runs |

### Spatial, sensory, accessibility (BRIEF §6, §9)
| ID | Capability | Ref | Acceptance check |
|---|---|---|---|
| C20 | **Tabletop micro-factory ≈60×40 cm anchored** to the detected table plane; if no plane within **3 s**, a **fallback plinth at seated desk height** in front of the user | §6 | Emulator with plane → anchored; without plane → plinth at 3 s; both sizes correct |
| C21 | **Reach & FoV:** everything within 0.61 m of the seated head, nothing behind, decision card inside the central view. Working target (log in DECISIONS.md, tune on device): card centre ≤10° from forward, extents within ±20° H / ±15° V. **Verify with IWSDK's VR Glasses FoV crop on Quest** | §6 | Automated geometry check of all interactables; FoV-crop screenshot shows card fully visible |
| C22 | **Purposeful passthrough:** twin among real objects; **real desk edge = veto chute**; with passthrough off (VR) the plinth edge is the chute and the scene visibly changes | §6 | Both modes demonstrate veto at the respective edge |
| C23 | **Risk encoding never colour-alone:** shape (smooth→spiked), motion (slow pulse→stutter), sound (low hum→rising tone), pattern (hatching); palette **blue / amber / magenta** (no red/green) for risk levels 0–3 | §6, §9 | Greyscale screenshot still distinguishes all four levels |
| C24 | **Spatial sound design:** every machine has its own voice; risk raises the tone from the machine's location; cues for drop, unfold, scrub, lock, hold, seal, veto, drill | §6 | Each cue fires once per event; positional |
| C25 | **Eyes-only mode:** dwell to inspect; gaze + single pinch approves **low-risk** intents; veto chute and escalate pad gaze-selectable | §6 | Complete token 1 and token 3 without grabbing |
| C26 | **One-handed alternative** to the two-hand hold: hold with one hand + **sustained gaze on the seal** | §6 | Complete token 2 with one hand |
| C27 | **High-contrast mode** | §6 | Toggle changes materials/UI to high contrast |
| C28 | **Captions for every audio cue** | §6 | Each cue in C24 shows a caption when captions on (default on) |
| C29 | **Pause/resume:** headset off / session hidden **freezes the rehearsal**; held intents stay held; **fail closed** — expired token **slowly sinks into the tray** and auto-rejects at zero. *(Live: TTL is wall-clock from server. Demo: TTL timers pause while hidden so judges don't lose tokens — log in DECISIONS.md)* | §6, §9 | Visibility change pauses; resume continues; TTL expiry → REJECT(expired) + sink animation |
| C30 | **Art direction "precision miniature":** matte, warm, toy-like machines vs cool translucent ghost; procedural/low-poly or properly licensed CC0 assets; no branded products | §6 | Visual review screenshot set in `docs/screens/` |
| C31 | **Settings reachable hands-first** (a small settings puck on the desk, poke to open, UIKitML panel) holding: eyes-only, one-handed, high-contrast, captions, reset, demo/live toggle | §6, §8 | All toggles reachable by poke/gaze-pinch |

### Content (BRIEF §7)
| ID | Capability | Ref | Acceptance check |
|---|---|---|---|
| C32 | Exactly these demo intents in one scene: (1) **conveyor speed +10%** — risk low, `single`; (2) **robot arm 250°/s next to a marked walkway zone** — high, `two_hand`, safe at **180°/s**; (3) **oven setpoint 450°C in Zone B** — exceeds hard limit, `forbidden`; (4) **drill: routine-looking pallet lift whose ghost clips a shelf** | §7 | Scenario JSON contains all four with correct policy/risk; each plays end-to-end |
| C33 | **Future packs documented only** (data centre, lab automation, commerce refunds) — listed in README roadmap and SUBMISSION "What's next"; not built | §7, §12 | Present in docs |

### Architecture (BRIEF §8)
| ID | Capability | Ref | Acceptance check |
|---|---|---|---|
| C34 | **Demo mode (default):** in-browser scenario engine replays recorded intent payloads against a deterministic simulator; no login, no backend; deploys as static site | §8 | Build served from `dist/` with network to backend blocked → full loop works |
| C35 | **Live mode (toggle):** relay between AgentSafe and the client, written in **Node/TypeScript (Fastify or similar + `ws`)** so it can run `@decionis/verify` in-process (deviation from the brief's FastAPI, required because the verifier is Node-only — log in DECISIONS.md). Ingests the **documented held-intent webhook**, calls the **documented resolve endpoint**; client-facing resolve is **authenticated**, **idempotent per intent_id**, **honours TTL**, enforces hash match | §8 | Relay tests (§8.3) pass against recorded webhook fixtures; client switches modes without reload issues |
| C36 | **Scripted agent** (rule agent; LLM optional) that issues the four tool calls through AgentSafe, per the documented API, for live mode and the video | §8 | `agent/run_demo_agent` produces the four held intents in live mode against the provisioned Cyclone policy |
| C37 | **ECS systems:** `IntentQueueSystem`, `TwinSystem` (asset_id→entity), `GhostRehearsalSystem` (deterministic kinematics: path sampling, envelope checks), `RiskEncodingSystem`, `DecisionGestureSystem` (place/hold/push), `SealSystem`, `DrillSystem`, `TrustSystem`, `SpatialAudioSystem` (+ `OnboardingSystem`, `SettingsSystem`, `PersistenceSystem` as needed) | §8 | Each exists as its own module with unit tests where logic is non-visual |
| C38 | **HeldIntent schema** exactly as in §5.1 below; **blast radius** derived from rehearsal (affected assets/zones) | §8 | Type-checked; JSON schema validation of all scenario files |
| C39 | **Signed records & verification.** **Live:** every Decision Dossier returned by AgentSafe is verified **in the relay** with `verifyDossierProofBundle({ dossier_payload, public_jwks })` against the **pinned Decionis production JWKS**. A seal is shown as verified only when `verified === true`, `required_artifact_coverage_verified === true` and the JWKS trust anchor is `DECIONIS_OFFICIAL`; anything else seals as **unverified** (fail closed, never "execute"). Also show the issuer tier from `assessDossierIssuer` (label a provisional anonymous workspace honestly) and a short **assurance scope** summary (`assessDossierAssuranceScope`: what was and wasn't established) in the seal's detail view. **Demo:** records signed in the browser with Ed25519 via `@noble/ed25519` and a per-install demo key, using Decionis sorted JSON v1 canonicalization, labelled "demo signature" | §3.6, §14 | Live: genuine dossier → verified seal, tampered dossier → unverified seal, both also checked with `npx @decionis/verify --file … --jwks …` (exit 0 / 1); demo: verify OK, fails on tampered |
| C40 | **Performance budget** (≤60k tris, instancing, baked lighting, single transparent ghost pass; 72 fps target, 60 min) and **on-device profiling** via IWSDK agent testing on Quest | §8 | Perf log in `docs/perf.md` with fps on device (or ⛔ H3 if no device) |

### Compliance & delivery (BRIEF §11–§14)
| ID | Capability | Ref | Acceptance check |
|---|---|---|---|
| C41 | No in-app brand names/logos; "policy gate" wording | §11 | `grep -ri "decionis\|agentsafe" src/ public/` returns nothing user-visible (adapter module names allowed, no rendered strings) |
| C42 | No human models; walkway as floor markings | §11 | Asset audit |
| C43 | Hands-only full run: complete onboarding with controllers never paired | §11 | Emulator run in hands mode only, logged |
| C44 | **Deploy** to GitHub Pages (correct Vite `base`), demo default, no expiring keys in client; site must stay unchanged through ~11 Dec | §11, §1 | Public URL loads on desktop and enters XR in emulator |
| C45 | `README.md`: run/build/deploy, demo vs live, **take-it-away statement** (full loop runs without AgentSafe), "rehearsal not prediction", simulated execution, roadmap (C33, two-person rule, voice, real PLC integration) | §11–13 | File present and accurate |
| C46 | `SUBMISSION.md`: name, the chosen tagline "Cyclone — the calm eye where humans decide what AI agents do." (earlier options kept in the brief for reference), track/division, the ≈440-word description, hand-interactions text, what's next, target launch "Q1 2027 (confirm)" — copied from BRIEF §13 and updated to match what was actually built | §2, §13 | Word count < 500; every claim is true of the build |
| C47 | `VIDEO.md`: BRIEF §14 shot list + a **capture mode** (`?capture=1`) that makes onboarding deterministic for recording (fixed timings, no random drills, captions on, clean HUD), plus an **end-card scene** (`?capture=endcard`): all machines idle, holding tray empty, seals from the session lined up evenly on the ledger shelf, ambient audio only, HUD and captions hidden so the tagline can be overlaid in editing | §14 | Capture mode reproduces every shot's beat in order; `?capture=endcard` renders the still tabletop with the seal row and no UI |
| C48 | **Cyclone policy file** for the provisioned AgentSafe policy covering the four scenarios: conveyor ≤ +10% `single`; arm `two_hand` with amendment allowed down to a safe ceiling (180°/s next to the walkway); oven setpoint hard limit below 450°C `forbidden`; pallet lift envelope. Written in the documented policy format, versioned in `policy/`; Festus provisions it (H1) | §3, §7 | Live: each scenario returns the expected requirement; amended arm call within ceiling is approved, above ceiling is denied |
| C49 | **Recorded real dossiers for demo mode:** run the live loop once, save each held-intent webhook payload and returned dossier as fixtures, verify them at build time with `@decionis/verify` (Node), and ship the stored verification result. The **shift handover** (C15) opens with these as last night's real, verified seals on the ledger shelf — judges see genuine Decionis-signed records without a backend | §5, §8 | Build step fails if any fixture doesn't verify; handover shows them with their stored check results |
| C50 | *(Should)* Demo records emitted in the Decision Dossier proof-bundle shape so the public CLI can check them against a demo JWKS (`npx @decionis/verify --file demo-dossier.json --jwks demo-jwks.json` → signatures valid, trust anchor honestly not official). Time-box to one day; if it slips, log 🟨 and keep the C39 demo signature | §8 | CLI exit 0 on an exported demo record |

### Explicitly out of scope (keep documented, do not build) — BRIEF §12 "Won't"
Two-person rule with a second reviewer · additional scenario packs · voice input (stretch goal only if all ✅ by 14 Nov) · real PLC integration. Mention in README and SUBMISSION.

---

## 4. Repository layout

```
/ (repo root)
├─ AGENTS.md  CLAUDE.md  brief.submission.v2.md  brief.submission.md
├─ CAPABILITIES.md  DECISIONS.md  README.md  SUBMISSION.md  VIDEO.md
├─ app/                      # IWSDK project (created by npm create @iwsdk@latest)
│  ├─ src/
│  │  ├─ main.ts             # world setup, gaze+pinch config, mode select
│  │  ├─ contracts/          # HeldIntent, Decision, SignedRecord types + JSON schemas
│  │  ├─ core/               # canonicalize.ts, hash.ts, glyph.ts, signing.ts, clock.ts
│  │  ├─ adapters/           # PolicyGateAdapter interface, demoAdapter.ts, liveAdapter.ts
│  │  ├─ scenario/           # engine.ts, scenarios/*.json (onboarding, handover, drills)
│  │  ├─ sim/                # kinematics.ts, envelope.ts (pure, unit-tested)
│  │  ├─ systems/            # one file per ECS system (C37)
│  │  ├─ ui/                 # UIKitML panels: card, settings, summary
│  │  ├─ audio/              # cue map, machine voices, captions
│  │  └─ state/              # persistence, trust, calibration (pure + storage)
│  ├─ public/assets/         # low-poly models, audio (CC0/self-made only)
│  └─ tests/                 # vitest unit + emulator e2e scripts
├─ relay/                    # Node/TypeScript + WebSocket (live mode); runs @decionis/verify
│  ├─ src/server.ts  src/agentsafe.ts  src/verify.ts  src/fixtures/  tests/
├─ policy/                   # Cyclone policy for AgentSafe (C48)
└─ agent/                    # scripted demo agent for live mode
```

---

## 5. Data contracts

### 5.1 HeldIntent (BRIEF §8 — do not change fields; you may add optional fields)
```ts
type HeldIntent = {
  intent_id: string;
  agent: { id: string; label: string };
  tool: string;                         // "set_arm_velocity"
  args: Record<string, unknown>;        // { cell: 3, joint: "axis_3", deg_s: 250 }
  target: { asset_id: string };
  policy: { rule_id: string; requires: "single" | "two_hand" | "forbidden" };
  risk: { level: 0 | 1 | 2 | 3; reasons: string[] };
  rationale?: string;
  expires_at: string;                   // ISO; expiry = auto-reject (fail closed)
  intent_hash: string;                  // sha256 hex of canonical {tool,args,target,rule_id}
  // optional additions allowed:
  is_drill?: boolean;                   // demo engine only; NEVER rendered before decision
  amend?: { param: string; min: number; max: number; step: number; safe_max?: number; unit: string };
};
```

### 5.2 Decision
```ts
type DecisionKind = "APPROVE" | "APPROVE_AMENDED" | "REJECT" | "ESCALATE" | "AUTO_APPROVE_RULE";
type Decision = {
  intent_id: string;
  decision: DecisionKind;
  intent_hash: string;                  // hash of the payload the user rehearsed
  amended_args?: Record<string, unknown>;
  amended_hash?: string;                // hash of {tool, amended args, target, rule_id}
  reason?: { code: "user_veto" | "expired" | "counter_offer" | "forbidden"; suggested?: Record<string, unknown> };
  gesture: "place" | "two_hand_hold" | "one_hand_gaze_hold" | "gaze_pinch" | "veto_push" | "escalate_place" | "rule";
  client_ts: string;
};
```

### 5.3 SignedRecord
`{ record_id, intent_id, decision, intent_hash, amended_hash?, decided_at, rehearsal: { args, path_samples_ref }, source: "demo" | "live", dossier?: <raw Decision Dossier payload>, verification: { verified, required_artifact_coverage_verified, trust_anchor, issuer_tier, assurance_scope_summary, checked_at } | { demo_signature, key_id } }` — `rehearsal` is what C11 replays; `verification` is computed by the relay (live) or at build time (C49 fixtures), never in the browser.

### 5.4 Canonicalization & hash (C13)
- **Intent hash:** Agent-Safe Intent v1 (`agent-safe.intent/1`), spec at `github.com/decionis/agent-safe-pipeline/blob/master/spec/intent/v1/README.md`. Read §3 of the spec for the binding fields and the canonical byte rules, then port `intentHash()` to the browser (WebCrypto SHA-256). Amended calls are mutations with distinct hashes.
- **Dossier canonicalization:** Decionis sorted JSON v1 (recursively sort object keys, leave arrays and scalars in place, `JSON.stringify`); artifacts marked `RFC8785/JCS` use RFC 8785. Only needed in the browser for demo signing (C39/C50).
- **Parity is mandatory:** a Node test imports `intentHash` and `stableJsonStringify` from `@decionis/verify` and asserts byte-identical output with the browser port across all scenario bindings, the conformance corpus, and edge cases (key order, nesting, unicode, numbers).
- **Glyph (C10):** deterministic shape/rune from the first 8 bytes of the hash; any change to the binding changes hash and glyph.

---

## 6. Systems — implementation notes

1. **PolicyGateAdapter interface:** `connect()`, `onIntent(cb)`, `resolve(decision): Promise<SignedRecord>`, `capabilities: { supportsAmendedApproval: boolean; source: "demo"|"live" }`. Demo adapter wraps the scenario engine and signs locally (flag configurable to exercise both C12 paths); live adapter talks to the relay with `supportsAmendedApproval = true`.
2. **GhostRehearsalSystem:** pure kinematics in `sim/` — sample the commanded motion over time, test against envelope volumes (walkway, shelf, hard limits), return path samples + first breach `{t, position}` + affected assets (= blast radius). Must recompute within one frame budget when the dial moves (cache, coarse-then-fine sampling). Same function powers scrub (C03), live re-rehearsal (C04), real-speed replay during the hold (C06), drill reveal (C16) and ledger replay (C11).
3. **DecisionGestureSystem:** detects place-in-slot, place-on-escalate-pad, two-hand hold (both hands grabbing for 1.5 s; abort on release), one-hand + sustained-gaze variant, gaze-pinch (eyes-only, low-risk only), push past desk/plinth edge. Enforces `policy.requires` (slot locks for `forbidden`; `single`-only for gaze-pinch approval).
4. **IntentQueueSystem:** ordering, holding tray layout, TTL sink animation, expiry → REJECT(expired), pause on visibility change (C29), auto-approval under accepted trust rules (C17).
5. **TwinSystem / anchoring:** IWSDK plane detection + anchors; 3 s fallback to plinth (C20); exposes the desk/plinth edge line to the gesture system (C07, C22).
6. **Onboarding / capture:** `OnboardingSystem` sequences C14 beats from the onboarding scenario; `?capture=1` fixes seeds and timings (C47).

5. **Decionis integration — confirmed facts (28 Oct):**
   - Held-intent webhook format and resolve endpoint: **documented**. Start at `https://decionis.com/docs` (Decision Dossier docs: `https://decionis.com/docs/decision-dossier`) and the public `decionis/agent-safe-pipeline` repo (Intent v1 spec + conformance vectors). Record the exact URLs, payload shapes and auth scheme you used in `docs/agentsafe.md`, and save sample payloads as relay test fixtures.
   - Approve-with-changed-arguments: **supported**, evaluated against the provisioned policy (C12, C48).
   - Signing: AgentSafe signs Decision Dossiers (Ed25519, JWKS key rotation). Verification: **`@decionis/verify`** (v0.5.0+, Apache-2.0, Node ≥18, zero runtime deps). Library: `verifyDossierProofBundle`, `verifyDossierFromUrls`, `assessDossierIssuer`, `assessDossierAssuranceScope`, `assessJwksTrustAnchor`, `intentHash`, `verifyIntentVector`, `stableJsonStringify`. CLI: `npx @decionis/verify --file dossier.json --jwks <url> [--json]` (exit 0 valid / 1 invalid / 2 usage) and `npx @decionis/verify intent <file-or-dir>`.
   - Execution eligibility needs more than a valid signature: `required_artifact_coverage_verified === true` and an established trust anchor. Use the latest verifier — an older one can report a newer binding as not covered.

---

## 7. Milestones (dates from BRIEF §12)

Each milestone ends with: all listed capabilities at ✅ in `CAPABILITIES.md` (or ⛔ with H-reason), tests green, commit `M<n>`, deploy (from M2).

| M | Window | Scope (capability IDs) | Gate |
|---|---|---|---|
| M0 | 28–29 Oct | Scaffold IWSDK (mixed reality), enable gaze+pinch, TypeScript strict, vitest, lint; create CAPABILITIES.md / DECISIONS.md; read Decionis docs → `docs/agentsafe.md`; contracts + Intent v1 hash port with `@decionis/verify` parity tests + glyph | `npm test` green; app enters XR in emulator with hands |
| M1 | 30 Oct–3 Nov | C20, C21 (geometry check), C31 shell, C34 engine, C32 scenario JSON, C01, C02, C05, C10, C13, C39 (demo signing), C19 basic | One token end to end: inspect → place → seal, in emulator, hands only |
| M2 | 4–6 Nov | C03, C04, C12, C06, C26, C07, C22, C08, C09, C11, first GitHub Pages deploy (C44) | All four scenario tokens decidable by every intended gesture |
| M3 | 7–10 Nov | C23, C24, C28, C29, C16, C14 (full onboarding), C18, C35 relay + C36 agent + C48 policy (credentials via H1), C49 fixtures recorded | Full 5-minute shift runs in order with timings met |
| M4 | 11–13 Nov | C17, C15, C19 complete, C25, C27, C30 art + sound pass | All register rows ✅ except device-dependent ones |
| M5 | 14–16 Nov | C50 (time-boxed), C40 on-device perf, C21 FoV-crop verify, C41–C43 audits, C45–C47 docs, capture mode; optional voice stretch only if everything else ✅ | Release candidate deployed; DoD (§9) checklist complete |
| Freeze | 17 Nov | No features. Fix-only. Test public URL on clean device with controllers off | Tag `submission-rc` |
| Submit | 18 Nov AM | Human submits (H2) | — |

If behind schedule, protect in this order: demo-mode core loop (C01–C13) → onboarding (C14) → content (C32) → accessibility (C23, C25–C28) → habit loop (C15–C19) → live mode (C35–C36). Nothing is removed — lagging items are logged ⛔/🟨 with a reason so a human can decide.

---

## 8. Testing

1. **Unit (vitest):** canonicalize/hash/glyph; kinematics + envelope (arm 250 breaches walkway, 180 does not; oven 450 > hard limit; pallet lift clips shelf); trust ring math + rule matching; calibration score; TTL/expiry; amend semantics both flags; decision validation by `policy.requires`.
2. **Emulator e2e (IWSDK MCP / IWER, hands mode — never controllers):** script the onboarding and each acceptance check in §3; save screenshots to `docs/screens/` (normal, greyscale for C23, high-contrast, FoV crop).
3. **Relay (vitest, Node):** verification of recorded dossiers (valid / tampered / wrong JWKS / missing coverage); auth required; idempotent re-POST returns same record; hash mismatch → 409; expired → 410; WebSocket broadcast of held/resolved/expired.
4. **Device (needs H3):** Quest 3/3S fps, FoV crop, plane detection in two different rooms, hands-only run.

### 8.1 Relay API (live mode)
- `POST /webhooks/policy-gate` — inbound held intents from AgentSafe (verify webhook signature if AgentSafe provides one).
- `WS /ws` — server→client: `intent.held`, `intent.resolved`, `intent.expired`, `record.sealed`.
- `POST /intents/{intent_id}/decision` — body `Decision`; `Authorization: Bearer <session>`; idempotent per intent_id; 409 on hash mismatch; 410 on expired; 200 returns `SignedRecord` (from AgentSafe via `agentsafe_client.py`).

---

## 9. Definition of Done

- [ ] Every C01–C50 row ✅ (or ⛔ with an H-item and a working demo-mode fallback)
- [ ] Full shift completes hands-only; first token ≤15 s, satisfying beat ≤90 s, shift ≈5 min
- [ ] Demo mode works from the public URL with no backend
- [ ] ≥60 fps on Quest (or ⛔H3 logged), ≤60k tris
- [ ] No brand strings/logos rendered; no human models; captions on by default
- [ ] README, SUBMISSION (<500 words, all claims true), VIDEO (with capture mode) complete
- [ ] Intent-hash parity tests pass against `@decionis/verify` and the conformance corpus
- [ ] A live dossier from the demo run verifies with `npx @decionis/verify` (exit 0) and its seal shows verified
- [ ] `DECISIONS.md` lists every interpretation made (at minimum: escalate semantics, demo TTL pause, FoV numeric target, signing in demo mode, Node relay instead of FastAPI)
- [ ] Tagged `submission-rc`; nothing pushed after 17 Nov except critical fixes

---

## 10. Final report the agent must produce

At the end (and at each milestone), output a short status: milestone reached, register counts (✅/🟨/⛔), public URL, open H-items, and any deviations from the brief.

---

## 11. Human-only items (the only reasons to stop and ask)

| ID | Needed from Festus | Blocks | Agent fallback meanwhile |
|---|---|---|---|
| H1 | AgentSafe **credentials** for a Cyclone workspace, plus **provisioning the C48 policy** (and confirming the agent wrote it in the right format). API shapes are documented — the agent reads them itself | C35/C36/C48 live runs, C49 recording | Build everything against documented shapes and recorded fixtures; demo mode unaffected |
| H2 | Start program membership, Devpost registration and final submission | Submission | Prepare all materials |
| H3 | Quest 3/3S device test sessions (fps, FoV crop, two rooms) | C40, C21 device verify, C20 room robustness | Emulator + IWSDK on-device tooling when connected |
| H4 | Record the <3-min video from real headset capture | C47 output | Capture mode + shot list |
| H5 | Confirm brand rule 4.19 interpretation with the hackathon manager | C41 wording in docs | Strictest reading (no brand in app) |
| H6 | Confirm target launch date | C46 | "Q1 2027 (confirm)" |
