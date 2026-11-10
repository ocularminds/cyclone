# Cyclone — submission copy

**Name:** Cyclone

**Tagline:** Cyclone — the calm eye where humans decide what AI agents do.

**Track:** Productivity · **Division:** New Experience

**Target launch:** public beta as a PWA, Q1 2027. *(confirm — H6)*

**Video:** [Public YouTube demo](https://youtu.be/NaKl8JTSMP4)

## Description

**Inspiration.** AI agents can ask to change a setpoint, move a robot or restart a line. A person may see only
an approval prompt, even though the consequences are spatial. Cyclone puts the proposed action beside a miniature
of the affected machine, so reviewing it becomes something you can see and handle at your desk.

**What it does.** A held action arrives as a glowing token, connected to its target by a light thread. Look at
it to inspect the agent, requested value, rationale, rule and affected area. Pull the timeline to scrub a
translucent rehearsal from the machine's kinematic model. Where the model crosses an envelope, the breach flares.
Twist the dial to amend the value and compare the dashed original path with the solid proposed path. One active
ghost keeps the difference legible without doubling the moving model.

Decide with your hands: place a routine token in the execute slot, maintain a two-hand hold for a critical action,
or push it off the desk edge to veto. Releasing a hold cancels it. A forbidden action locks the slot; escalation
keeps the action held. Each demo decision produces a locally signed receipt with the reviewed values, model
snapshot and matching action glyph. Pick up its seal to inspect the proof separately and replay the retained
rehearsal, including after a reload.

A first shift teaches four scenarios: conveyor speed, robot-arm velocity near a walkway, an excessive oven
setpoint and a pallet-lift drill. Unfinished onboarding resumes; completed onboarding opens daily handover.
Drills count timeouts as misses and leave unresolved escalations unassessed. Trust rings can offer a bounded,
expiring demo rule that the user physically accepts and can later revoke.

**How we built it.** Cyclone uses Meta's Immersive Web SDK 1.0, TypeScript, Three.js and ECS systems. Procedural
machines, deterministic kinematics, local fonts and synthesised sound keep the demo self-contained. Intent hashes
match the Agent-Safe Intent v1 reference implementation; amended actions have distinct hashes. A separate relay
integrates Decionis AgentSafe and checks signed action bindings. Provisioned service acceptance remains open;
incomplete proof stays unverified, with recovery that never repeats approval. Judges can use the full demo without that service,
a login or a backend. Demo execution is simulated, and rehearsals are never predictions or guarantees.

**Hand interactions.** Inspect, pull, twist, place, hold and push form the core loop. Paged settings and named
detail controls support Gaze + pinch, a preferred-hand alternative, larger text, high contrast, captions and
reduced motion. The seated workflow is tested with emulated hands. Physical Quest performance and narrow-field
validation remain required device checks.

**What's next.** Two-person review, data-centre, lab and commerce packs, voice alternatives, and real PLC
integration with execution receipts.

## Submission readiness

**Submitted 10 November 2026** to the Meta VR Start Developer Competition 2026, Productivity / New Experience.
The owner confirmed the four eligibility declarations and explicitly approved the Official Rules and Devpost
Terms of Service. Devpost displayed **“Project submitted!”** and **“SUBMITTED TO”** after the final action.
See the [confirmation](docs/devpost/submitted.jpg) and [submission record](docs/devpost/status.json).

The [Devpost entry](https://devpost.com/software/cyclone-the-calm-eye-for-ai-agents-decisions) includes the
corrected pitch/story, public 2:49 video, six captioned images, technical answers and
[artifact download](https://ocularminds.github.io/cyclone/submission/cyclone-artifacts.zip).
Its story adds a short challenges/lessons paragraph and remains below 500 words (467).

The entry describes the implemented demo and its current limitations. H1 live acceptance, H3 physical-device
checks, H4's stricter headset recording and H6's firm launch date remain open. The current competition rules
permit the submitted emulator footage. Edits close 18 November 2026 at 21:00 Stockholm; the repository freeze
is 17 November, and the hosted submission must stay available through the winner announcement around 11 December.
