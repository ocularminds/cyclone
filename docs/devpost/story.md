**In 30 seconds.** An AI agent asks to run a robot arm at 250°/s beside a walkway. In Cyclone, that request
isn't a pop-up. It lands on your desk as a token beside a miniature of the arm. Pull a ghost of the motion and
watch it flare where it crosses the walkway. Twist the dial down to 180°/s, the breach clears, and you approve by
holding the token with both hands for 1.5 seconds.

**Inspiration.** AI agents now change setpoints and move robots, yet the accountable person usually sees a yes/no
prompt for consequences that are spatial. We wanted review to feel like handling the action, not clicking past it.

**What it does.** Each held action arrives as a glowing token, tethered by a light thread to its machine in a
tabletop factory placed on your desk, or on a seated plinth if no desk is found. Look at a token to see who asked, why, and
which rule stopped it. Pull the timeline to scrub a rehearsal from the machine's kinematic model; the
breach point flares. Twist the dial to amend, then compare the original and amended paths.

Decide with your hands: place a routine token in the execute slot, hold a critical one with both hands while the
rehearsal plays (let go to cancel), or push it off the desk edge to veto. Forbidden actions lock the slot. Every
decision becomes a signed seal stamped with the same glyph as its token, so what you saw is what you signed. Pick
up a seal to replay what you reviewed.

**Why come back.** A short daily handover presents what your agents held overnight. Drills occasionally slip in a
plausible but unsafe request and reveal themselves only after you decide, keeping a calibration score so approval
never becomes a reflex. Agents with a clean record fill a trust ring and can earn a narrow, expiring rule that you
accept by placing it on them, so the desk gets quieter.

**How we built it.** Meta's Immersive Web SDK 1.0, TypeScript and Three.js with ECS systems; plane detection with a
fallback plinth; procedural machines and synthesised spatial sound, with captions on by default. Action hashes
follow the Agent-Safe Intent v1 reference implementation. A separate Node relay integrates Decionis AgentSafe for
live mode. The demo needs no login or backend.

**Challenges and lessons.** Keeping the decision, its proof and the physical execution separate mattered more than
a convincing animation. Hand-tracking drift taught us to fail closed: a token let go in mid-air is not a veto.

**Status.** The full four-scenario shift is verified end to end with emulated hands, and the video is emulator
footage. Physical Quest validation remains pending. Demo execution is simulated, rehearsals are not
predictions, and demo seals carry a local demo signature. Live policy-gate acceptance is still pending.

**What's next.** Two-person review; data-centre, lab and commerce packs; voice; and real PLC integration with
execution receipts.
