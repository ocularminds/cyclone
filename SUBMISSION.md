# Cyclone — submission copy

**Name:** Cyclone
**Tagline:** Cyclone — the calm eye where humans decide what AI agents do.
**Track:** Productivity · **Division:** New Experience
**Target launch:** public beta as a PWA, Q1 2027, ahead of Meta VR Glasses. *(confirm — H6)*

---

## Description

**Inspiration.** AI agents are getting permission to act: change a setpoint, move a robot, restart a line. The last
safety layer is a human approval — usually a 2D prompt full of JSON that people learn to rubber-stamp. Physical
consequences are spatial, so we made the review spatial too. Approve the outcome, not the payload.

**What it does.** Cyclone is the calm eye of the storm. When an AI agent attempts a high-stakes action, a policy
gate holds it and a small token lands on your real desk, beside a tabletop twin of the machines it wants to change.
Look at the token to open it. Pinch its timeline and pull to scrub the future: a ghost of the machine rehearses the
action from its kinematic model and shows exactly where it would breach a safety envelope. Twist the dial to amend
the value and watch the rehearsal update live. Then decide with your body: place the token in the execute slot,
hold it with both hands for critical actions (let go to abort), or push it off the edge of your desk to veto. Every
decision is sealed into a signed record bound to the exact action you rehearsed — what you see is what you sign.

A five-minute daily handover reviews what agents held overnight. Occasional drills — plausible but unsafe actions —
keep you sharp and score your vigilance, and agents earn trust over time: drop an earned rule on an agent and its
routine changes execute themselves, so your desk gets quieter as agents prove themselves.

**How we built it.** Cyclone is built from scratch with Meta's Immersive Web SDK 1.0 on Three.js and its ECS.
Gaze and pinch make it ready for Meta VR Glasses; pinch-grab and palm gestures drive every decision; plane detection
and anchors put the twin on your real table, with a plinth fallback for rooms without one. A deterministic
kinematic simulator produces the ghost rehearsal. Intent hashes follow Agent-Safe Intent v1 and match the reference
verifier byte for byte. In live mode, agent tool calls are held by Decionis AgentSafe and relayed to the headset;
approvals return as Decision Dossiers verified against the official keys. Judges get a self-contained demo mode with
no login or backend — remove the third-party service and the whole loop still runs.

**Hand interactions.** No buttons, no menus. Inspect = look. Rehearse = pinch and pull. Amend = pinch and twist.
Commit = place, or a two-hand hold for critical actions. Veto = push off the desk. Everything happens seated, within
arm's reach, and the decision card stays inside the narrower VR Glasses field of view. Eyes-only and one-handed modes
are built in, with captions for every sound.

**What's next.** A two-person rule where a second reviewer joins the same desk, scenario packs for data centres,
labs and commerce, voice alternatives, and real PLC integration.

---

*Honesty notes for judges:* ghosts are rehearsals from the twin's kinematic model, not predictions; physical
execution in the demo is simulated.

