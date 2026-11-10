# Cyclone — submission copy

**Name:** Cyclone

**Tagline:** Cyclone — the calm eye where humans decide what AI agents do.

**Track:** Productivity · **Division:** New Experience

**Target launch:** public beta as a PWA, Q1 2027. *(confirm — H6)*

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
integrates Decionis AgentSafe. Live signed-action binding and provisioned service acceptance remain open; the
interface conservatively labels incomplete proof as unverified. Judges can use the full demo without that service,
a login or a backend. Demo execution is simulated, and rehearsals are never predictions or guarantees.

**Hand interactions.** Inspect, pull, twist, place, hold and push form the core loop. Paged settings and named
detail controls support Gaze + pinch, a preferred-hand alternative, larger text, high contrast, captions and
reduced motion. The seated workflow is tested with emulated hands. Physical Quest performance and narrow-field
validation remain required device checks.

**What's next.** Two-person review, data-centre, lab and commerce packs, voice alternatives, and real PLC
integration with execution receipts.

## Submission readiness

This copy describes the implemented demo and its current limitations. Confirm H1 live acceptance, H3 hardware
checks, H4 headset video, H6 launch date and the final capability register before the human submission (H2).
