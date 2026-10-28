# Cyclone — Submission Brief v2

**Competition:** Meta VR Start Developer Competition 2026
**Track / Division:** Productivity · New Experience
**Deadline:** 18 Nov 2026, 12:00 PT (21:00 Stockholm) · 21 days from this revision (28 Oct)
**Build:** Immersive Web SDK 1.0 (WebXR) · Meta VR Glasses-first, Quest 3/3S compatible

---

## 0. What changed from v1, and why

| # | v1 | v2 | Why it scores more |
|---|----|----|----|
| 1 | Quest headset | **Meta VR Glasses-first** (gaze + pinch), runs unchanged on Quest | The competition is framed around VR Glasses; Technical Implementation explicitly names gaze and FoV-aware design. |
| 2 | R3F + `@react-three/xr` snippet, then "use IWSDK" | **IWSDK 1.0 only** | v1 mixed two stacks. The snippet also pairs `createXRStore` (v6 API) with `<Interactive>` (removed after v5), so it would not run. IWSDK gives gaze-as-pointer, grab/two-hand grab/poke, UIKitML, plane detection and anchors out of the box. |
| 3 | Approve / Reject buttons | **A hands-first ritual:** Inspect → Rehearse → Amend → Commit → Seal | Two buttons is a 2D inbox in 3D. Judges reward mechanics that only work spatially. |
| 4 | Walk onto a factory floor | **Tabletop micro-factory anchored to your real desk** | Passes the airplane-seat test by construction and makes passthrough purposeful. |
| 5 | One-shot demo | **Daily loop:** shift handover, drills, agent trust | "Habit-forming purpose" is in the Experience Design criterion; Best Reason to Come Back is a special award. |
| 6 | Red/green risk colours | **Shape + motion + sound + pattern**, colour-blind-safe palette | Accessibility and clarity; also eligible for Accessibility Forward. |
| 7 | "Biometric gesture" approval | **Two-hand dead-man's hold** | WebXR exposes no biometric API; a vague claim invites doubt. The hold is real, demonstrable and dramatic. |
| 8 | Self-scored "Excellent / Definite pass" | **Honest risk register** (section 10) | Track fit is the biggest risk, not a strength. Better to design for it now. |
| 9 | — | Added rubric map, award targets, compliance check, 3-week scope, submission copy, video shot list | Polish & Presentation is 25% and includes the written material and video. |

---

## 1. Facts that shape everything

- **Judging:** Stage 1 is pass/fail viability. Stage 2 is four criteria, **25% each**: Innovation & Creativity · Experience Design · Technical Implementation · Polish & Presentation.
- **Hard requirement:** fully usable with hands, end to end. Test: complete the whole experience without ever pairing a controller.
- **Guidelines:** airplane seat test (every interaction within a 2 ft radius), one bus stop test (fast cold start, clean pause/resume, satisfying in ≤10 min), take-it-away test (remove the third-party service — is there still a project?).
- **Experience Design** explicitly checks that passthrough is purposeful ("the real room meaningfully changes the experience") and that essential UI sits inside the narrower FoV.
- **Technical** wants ≥60 fps on Quest, and for passthrough: scene understanding, anchoring to detected planes, and holding up "in rooms the developer never tested".
- **Video:** under 3:00, real footage, lead with the story; judges won't watch past 3:00; don't lean on AI-generated video.
- **Build:** public HTTPS link that stays up and unchanged until winners are announced (~11 Dec). AI may assist judging, so write the description in clearly labelled sections.
- **Prizes:** Best New Productivity $70k, runner-up $35k. Special awards $25k each. One prize per entry.
- **Content rules:** no corporate logos, brand names or slogans in the Project (rule 4.19); no identifiable people (4.17); English.

---

## 2. Positioning

**Name:** Cyclone — keep it, and give it meaning. Agents act at machine speed; Cyclone is the *eye of the storm*, the calm, still centre where a human decides.

**Thesis:** *Approve the outcome, not the payload.* And: *what you see is what you sign.*

**One-liner:** When an AI agent wants to change something in the physical world, Cyclone puts that action on your desk as a small object — you watch its future, reshape it with your hands, and seal the decision.

**Tagline (chosen, 61 chars):** *Cyclone — the calm eye where humans decide what AI agents do.*

**Earlier options (kept for reference):**
- A (116): *Your AI agents want to move real machines. See the future of every action on your desk, then decide with your hands.*
- B (126): *The calm eye of the storm: rehearse, reshape and seal what your AI agents do in the physical world. Hands-first, on your desk.*
- C (109): *Don't read the JSON. Watch the outcome. A hands-first approval desk for AI agents that act in the real world.*

**Award targets** (one prize max, but more doors open):
1. Best New Productivity Experience (primary)
2. **Best Agentic Interaction** — "apps where AI is a core part of the experience". Agents *are* the content here. Strongest special-award fit; v1 didn't mention it.
3. Boldest Original Concept — consequence rehearsal at real-world scale falls apart on a flat screen.
4. Best First Five Minutes — see the onboarding script in section 4.

**The problem (inspiration):** Agents are getting tool access to real systems. The last safety layer is a human approval — usually a 2D prompt full of JSON that people learn to rubber-stamp. The higher the stakes, the less a payload tells you. Physical consequences are spatial, so the review should be too.

---

## 3. Core loop: Intercept → Rehearse → Decide → Seal

| Step | What happens | Hands / eyes | Platform feature |
|---|---|---|---|
| **1. Intercept** | Agent calls `set_arm_velocity(cell=3, joint="axis_3", deg_s=250)`. The policy gate holds it. A glowing token drops into the holding tray on your desk; a light thread tethers it to the target machine in the tabletop twin, which hums from its position. | — | Spatial audio, anchors |
| **2. Inspect** | Look at the token: it lifts and unfolds into a card in your central view — agent, rationale, rule that tripped, blast radius. | Gaze (+ pinch for detail) | Gaze-as-pointer, FoV-aware layout |
| **3. Rehearse** | Pinch the token's timeline handle and pull toward you to scrub the future. A translucent ghost of the arm sweeps its path; the exact point where it breaches the walkway envelope flares. | Pinch-drag | Hand tracking, depth |
| **4. Amend** | Grab the dial on the token and twist 250 → 180. The ghost re-rehearses live; the breach clears. | Grab + rotate | Grab interactions |
| **5. Decide** | **Low risk:** place the token in the execute slot. **High risk:** both palms on the token for 1.5 s while the ghost replays at real speed — the dead-man's hold; let go and it aborts. **Veto:** push the token off the real edge of your desk into the veto chute. **Forbidden** (hard-limit breach): the execute slot locks; only veto or escalate. | Place · two-hand hold · push | Two-hand grab, poke, plane detection (desk edge) |
| **6. Seal** | The decision becomes a signed record — a small seal crystal stamped with a glyph derived from the intent hash, the same glyph shown on the token. It lands on your ledger shelf. Pick one up later to replay what you saw. | — | Persistence |

**Amend semantics:** AgentSafe supports approving a call with changed arguments, evaluated against the provisioned policy, so the amended call is sent, re-checked and signed. If the policy refuses the amended value, the token stays held and the user can counter-offer instead (reject with a suggested value; the agent re-proposes).

---

## 4. The first five minutes (scripted onboarding, no text walls)

| Time | Beat | Teaches |
|---|---|---|
| 0:00 | Open link → Enter XR. The micro-factory blooms on your real table (fallback: a floating plinth at desk height). | Where things live |
| 0:15 | First token: conveyor +10%. It glows until you look at it, then a pinch hint pulses once. Place it in the slot → seal. | Look, pinch, place |
| 1:00 | Second token: arm 250°/s near the walkway. The timeline handle wiggles. Scrub → breach flares. Dial wiggles → twist to 180 → breach clears → two-hand hold → seal. | Rehearse, amend, commit |
| 3:00 | Third token: oven setpoint 450°C in Zone B. Execute slot locks. Push it off the desk. | Veto, forbidden actions |
| 4:00 | Fourth token looks routine (pallet lift). Most people approve it. "Drill — you missed it": the ghost replays the shelf clip. Calibration score appears. | Vigilance; why the loop matters |
| 5:00 | Shift summary: 4 decisions, 1 amended, 1 vetoed, 1 drill missed. Agent trust rings shown. | Reason to come back |

Satisfying moment within 90 seconds; complete "shift" in 5 minutes — passes the one bus stop test.

---

## 5. Why come back (habit loop)

- **Shift handover** — the daily moment. A five-minute review of what agents held overnight. Cold start to first token under 15 seconds.
- **Drills** — borrowed from airport baggage screening, where synthetic threat images are injected to keep screeners alert. Cyclone occasionally injects a plausible but unsafe intent and reveals it as a drill only after you decide. Your catch rate is your calibration score. This defends against rubber-stamping, and the progression rewards vigilance rather than throughput.
- **Agent trust rings** — each agent's ring fills as its proposals pass without amendment. At a threshold, Cyclone offers a rule ("auto-execute conveyor changes under +5%"); you grab the rule and drop it onto the agent to accept. The desk gets quieter as agents prove themselves — the reward is fewer interruptions.
- **Ledger shelf** — seals accumulate across sessions; any one replays its rehearsal (audit you can hold).

---

## 6. Spatial, sensory and accessibility design

- **Scale:** micro-factory ≈ 60 × 40 cm, anchored to the detected table plane. Fallback plinth if no plane is found within 3 s, so it holds up in untested rooms.
- **Reach:** everything within 2 ft, nothing behind you, no standing. Decision card stays inside the central field of view; verify with IWSDK's VR Glasses FoV crop on Quest.
- **Passthrough with purpose:** the twin sits among your real things; the **real desk edge is the veto chute**. Switch passthrough off and the experience changes — that's the test judges apply.
- **Risk encoding, never colour alone:** shape (smooth → spiked), motion (slow pulse → stutter), sound (low hum → rising tone from the machine's location), pattern (hatching). Palette blue / amber / magenta instead of green / red.
- **Accessibility:** eyes-only mode (dwell to inspect, gaze + single pinch for low-risk approval); one-handed alternative to the two-hand hold (hold + sustained gaze on the seal); high-contrast mode; captions for every audio cue. Voice is a stretch goal.
- **Pause/resume:** headset off freezes the rehearsal; held intents stay held. Physical actions fail **closed** — an expired token auto-rejects.
- **Art direction:** "precision miniature" — matte, warm, toy-like machines against a cool, translucent ghost. Sound design does half the work: each machine has a voice.

---

## 7. Demo content (one scene, finished)

1. Conveyor speed +10% — low risk, single place.
2. Robot arm 250°/s next to a marked walkway zone — high risk, two-hand hold. (Zone is a floor marking; no human figures.)
3. Oven setpoint 450°C in Zone B — exceeds hard limit; forbidden.
4. Drill: routine-looking pallet lift whose ghost clips a shelf.

Future packs (description only): data centre, lab automation, commerce refunds.

---

## 8. Architecture

```
 Agent (scripted LLM / rule agent)
   │ tool call
   ▼
 Decionis AgentSafe  ── policy gate: HOLD ──►  Relay (Node, WebSocket)   ──►  Cyclone client (IWSDK)
   ▲                                              ▲                                 │
   │ resolve(intent_id, decision, intent_hash)    └──────── decision ◄──────────────┘
   ▼
 Signed decision record ──────────────────────────────────────────► seal on the ledger shelf
```

**Verification:** every Decision Dossier is verified in the relay with `@decionis/verify` (Node-only) against the pinned Decionis JWKS. A seal shows verified only when signatures, required-artifact coverage and the trust anchor all pass.

**Two modes**
- **Demo mode (default, what judges open):** an in-browser scenario engine replays recorded AgentSafe intent payloads against a deterministic simulator. No login, no backend, static hosting (GitHub Pages). It cannot go down during judging.
- **Live mode (toggle):** real interception through AgentSafe via the relay. Used for the "under the hood" part of the video and for real users.

**Client systems (IWSDK ECS):** `IntentQueueSystem`, `TwinSystem` (asset_id → entity), `GhostRehearsalSystem` (deterministic kinematics: path sampling, envelope checks), `RiskEncodingSystem`, `DecisionGestureSystem` (place / hold / push), `SealSystem`, `DrillSystem`, `TrustSystem`, `SpatialAudioSystem`.

**Held intent schema**
```ts
type HeldIntent = {
  intent_id: string;
  agent: { id: string; label: string };
  tool: string;                         // "set_arm_velocity"
  args: Record<string, unknown>;        // { cell: 3, joint: "axis_3", deg_s: 250 }
  target: { asset_id: string };         // maps to a twin entity
  policy: { rule_id: string; requires: "single" | "two_hand" | "forbidden" };
  risk: { level: 0 | 1 | 2 | 3; reasons: string[] };
  rationale?: string;                   // agent's stated reason
  expires_at: string;                   // TTL; expiry = auto-reject (fail closed)
  intent_hash: string;                  // sha256 of canonical {tool, args, target, rule_id}
};
```

**What you see is what you sign.** Intent hashes follow Agent-Safe Intent v1 (`agent-safe.intent/1`). The client reproduces the hash of the binding it rehearsed (parity-tested against `@decionis/verify`) and sends that hash with the decision. The relay refuses any decision whose hash doesn't match the held intent, so a payload can't change between rehearsal and approval. The resolve endpoint is authenticated, idempotent per `intent_id`, and honours the TTL.

```ts
// Browser port of intentHash() from @decionis/verify (agent-safe.intent/1);
// a Node parity test asserts byte-identical canonical JSON and hash.
const { canonical_json, intent_hash } = await intentHashBrowser(binding);
```

**Honesty about the ghost:** call it a *rehearsal* from the twin's kinematic model, not a physics prediction or a guarantee.

**Performance budget:** ≤60k triangles, instanced machines, baked lighting, a single transparent ghost pass, target 72 fps on Quest 3/3S (rule minimum 60). Use IWSDK 1.0's on-device agent testing to profile on the headset.

---

## 9. Payload → spatial mapping

| Field | Meaning | Manifestation |
|---|---|---|
| `target.asset_id` | Where | Light thread from token to the asset; spatial audio from that asset |
| `args` (numeric) | How much | Dial on the token; ghost speed/amplitude; envelope overlay |
| `policy.requires` | What it takes | single = place · two_hand = dead-man's hold · forbidden = execute slot locks |
| `risk.level` | How worried | Shape + motion + tone + pattern (never colour alone) |
| `agent` | Who | Agent sigil on the token; trust ring |
| `rationale` | Why | One line on the unfolded card; full text on second pinch |
| `expires_at` | How long | Token slowly sinks into the tray; at zero it auto-rejects |
| `intent_hash` | Binding | Glyph derived from the hash, shown on the token and stamped on the seal — a visible match |

---

## 10. Rubric map

| Criterion (25% each) | What judges must see | Where in the video |
|---|---|---|
| Innovation & Creativity | Rehearse-the-outcome approval; amend by twisting; drills against rubber-stamping; hash-bound seal. A concept that only works with depth, scale and hands. | 0:25–1:55 |
| Experience Design | First token < 15 s; teach-by-doing; seated within 2 ft; desk edge as veto chute; FoV-aware; daily handover loop | Throughout |
| Technical Implementation | IWSDK 1.0 gaze + pinch; two-hand grab; plane detection + anchors with fallback; deterministic rehearsal; live agent interception; hash binding; ≥60 fps | 1:55–2:20 |
| Polish & Presentation | Cohesive miniature art direction; spatial sound; captions; honest headset capture; clear sectioned description | All |

---

## 11. Compliance and risk register

| Risk | Level | Mitigation |
|---|---|---|
| **Track fit** — a factory console can read as an enterprise demo, not everyday productivity | **High** | Frame the user as anyone whose AI agents touch the real world. Lead with the daily five-minute handover. Tabletop scale makes it personal, not industrial. |
| **Brand rule 4.19** (no corporate logos/brand names in the Project) | Medium | No Decionis or AgentSafe logos or wordmarks inside the app or as video lower-thirds; in-app label is "policy gate". Name Decionis only in "How we built it". Consider confirming with the hackathon manager. |
| **Division** — "no pre-existing codebases" | Medium | All Cyclone code written after 24 Sep (repo is new). Decionis is consumed as an external service/package like any API; don't copy pre-existing Decionis UI code in. |
| Take-it-away test | Low | Demo mode runs the full loop without AgentSafe: twin, rehearsal, gestures, drills, trust are all Cyclone-built. Say this explicitly in the description. |
| Hands-first | Low | No controller code path required. Do a full run with controllers never paired. |
| Identifiable people | Low | Walkway zones and markings only; no human models with faces. |
| Availability through ~11 Dec | Medium | Static host, demo mode default, no login wall, no expiring API keys in the client. |
| Performance | Medium | Budget in section 8; profile on device in week 3. |
| Overclaiming safety | Medium | "Rehearsal", not "prediction"; state that physical execution in the demo is simulated. |

---

## 12. Scope and plan (21 days)

**Must (the vertical slice judges play):** one tabletop scene · 3 intents + 1 drill · inspect / scrub / amend / hold / push / seal · demo mode · gaze + pinch on · passthrough tabletop with fallback · spatial audio cues · ≥60 fps.
**Should:** live AgentSafe mode (for the video) · trust rings · shift summary · eyes-only mode.
**Won't (future plans in the description):** two-person rule with a second reviewer · more scenario packs · voice · real PLC integration.

| Week | Dates | Deliverable |
|---|---|---|
| 1 | 28 Oct – 3 Nov | IWSDK scaffold, gaze + pinch on, tabletop anchoring + fallback, intent schema + demo engine, one token end to end (inspect → place → seal) |
| 2 | 4 – 10 Nov | Ghost rehearsal + scrub, amend dial, two-hand hold, veto chute, risk encoding + audio, drill, live relay to AgentSafe |
| 3 | 11 – 16 Nov | Art and sound pass, onboarding beats, trust rings, on-device perf, FoV-crop check, record video, write submission |
| — | 17 Nov | Freeze, deploy, test the link on a clean device with controllers off |
| — | 18 Nov | Submit in the morning (hard deadline 21:00 Stockholm) |

---

## 13. Submission form copy (draft)

**Name:** Cyclone
**Tagline:** Cyclone — the calm eye where humans decide what AI agents do.
**Track:** Productivity · **Division:** New Experience

**Description (≈440 words, under the 500 suggested)**

**Inspiration.** AI agents are getting permission to act: change a setpoint, move a robot, restart a line. The last safety layer is a human approval — usually a 2D prompt full of JSON that people learn to rubber-stamp. Physical consequences are spatial, so we made the review spatial too. Approve the outcome, not the payload.

**What it does.** Cyclone is the calm eye of the storm. When an AI agent attempts a high-stakes action, a policy gate holds it and a small glowing token lands on your real desk, beside a tabletop twin of the machines it wants to change. Look at the token to open it. Pinch its timeline and pull to scrub the future: a ghost of the machine rehearses the action and shows exactly where it would breach a safety envelope. Twist the dial to amend the value and watch the rehearsal update live. Then decide with your body: place the token in the execute slot, hold it with both hands for critical actions (let go to abort), or push it off the edge of your desk to veto. Every decision is sealed into a signed record bound to the exact action you rehearsed — what you see is what you sign.

A five-minute daily handover reviews what agents held overnight. Occasional drills — plausible but unsafe actions — keep you sharp and score your vigilance, and agents earn trust over time, so your desk gets quieter as they prove themselves.

**How we built it.** Cyclone is built from scratch with Meta's Immersive Web SDK 1.0 on Three.js and its ECS. Gaze and pinch make it ready for Meta VR Glasses; grab, two-hand grab and poke drive every decision; plane detection and anchors put the twin on your real table, with a floating fallback for rooms without one. A deterministic kinematic simulator produces the ghost rehearsal. In live mode, agent tool calls are intercepted by Decionis AgentSafe and relayed to the headset over WebSockets; decisions return as signed records. Judges get a self-contained demo mode that replays real intercepted payloads with no login or backend — remove the third-party service and the whole loop still runs.

**Hand interactions.** No buttons, no menus. Inspect = look. Rehearse = pinch and pull. Amend = grab and twist. Commit = two-hand hold. Veto = push off the desk. Everything happens seated, within arm's reach, and the decision UI stays inside the narrower VR Glasses field of view. Eyes-only and one-handed modes are built in.

**What's next.** A two-person rule where a second reviewer joins the same desk, scenario packs for data centres, labs and commerce, and voice alternatives.

**Target launch:** public beta as a PWA, Q1 2027, ahead of Meta VR Glasses. *(confirm)*

---

## 14. Video shot list (≤ 2:55, real headset capture, captions on)

| Time | Shot |
|---|---|
| 0:00–0:08 | Passthrough: a real desk. A tiny factory blooms on it. A token drops with a tone. Caption: "Your AI agent wants to speed up a robot arm." |
| 0:08–0:20 | Flash a 2D JSON approval prompt. Caption: "Would you approve this?" Cut back to the desk. |
| 0:20–1:10 | Hero loop: look → card unfolds; scrub → breach flares at the walkway; twist 250 → 180 → breach clears; two-hand hold; seal stamps with the matching glyph. |
| 1:10–1:30 | Oven 450°C: execute slot locks; push the token off the real desk edge. |
| 1:30–1:55 | Drill: approve a routine move → "Drill — you missed it" → ghost replay → calibration score, trust ring fills. |
| 1:55–2:20 | Under the hood: split screen — agent terminal issues a tool call → held → token appears in headset → decision → signed record verifies. No logos on screen. |
| 2:20–2:36 | Glasses-ready: gaze + pinch, FoV crop, eyes-only mode. |
| 2:36–2:44 | The last token settles: seal lands on the shelf, machines slow to idle, the hum fades to quiet. Caption: "Approve the outcome, not the payload." |
| 2:44–2:55 | **Calm-eye end card.** Locked-off shot of the still tabletop in passthrough: every machine idle, no tokens in the tray, the seals lined up in a neat row on the ledger shelf, glyphs catching the light. Slow push-in, no motion except a faint glow on the seals. Tagline over it: **"Cyclone — the calm eye where humans decide what AI agents do."** Then title + link. |

---

## Appendix: removed from v1

- The R3F/`@react-three/xr` component (wrong API mix; stack is now IWSDK).
- "Step onto the factory floor" (fails the airplane seat test; replaced by tabletop).
- "Biometric gesture" (not available in WebXR).
- "Approval sends a 200 OK back to AgentSafe" (it's an authenticated resolve call bound to the intent hash).
- Self-assigned scores ("Excellent", "Definite pass").
