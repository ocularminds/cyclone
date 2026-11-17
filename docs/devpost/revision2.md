# Devpost copy — revision 2 (staged, not posted)

Status: **draft for owner approval.** Nothing below is on Devpost yet. Paste only after approval, and before
edits close (18 Nov 2026, 21:00 Stockholm). Fill the `[Quest]` placeholders from today's device session, or
delete them if it doesn't happen. Never claim a device result that wasn't measured.

What changed from the submitted copy (`story.md`):
- Opens with a concrete 30-second scenario, so a judge who reads only the first lines knows the product.
- Brings the daily habit loop (handover, drills, trust rings) up into its own section, since the brief rated Productivity track fit a High risk.
- Moves all the limitations into one honest **Status** section instead of hedging inside every section, and replaces jargon with plain words.
- Shows the most striking real capture (`amend.png`) second in the gallery.

---

## Elevator pitch

An AI agent's real-world action lands on your desk as a token: rehearse it, twist to amend, decide with your hands, and seal exactly what you saw.

## Story

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
footage. [Quest: "Tested on Quest 3: N fps, hands only."] Demo execution is simulated, rehearsals are not
predictions, and demo seals carry a local demo signature. Live policy-gate acceptance is still pending.

**What's next.** Two-person review; data-centre, lab and commerce packs; voice; and real PLC integration with
execution receipts.

## Hand interactions (field)

Look at a held token to inspect it. Pinch the timeline handle and pull to scrub the rehearsal. Grab and twist the
dial to amend the robot arm from 250 to 180°/s and compare paths. Place a routine token in the execute slot. Hold a
critical token with both palms for 1.5 seconds while the rehearsal plays; letting go cancels. Push a token off the
desk edge to veto; a token released in mid-air returns to the tray instead. Forbidden actions lock the slot; the
escalation pad keeps an action held for review. Pick up a seal to replay what you saw; place an offered rule on an
agent to accept it.

Alternatives: one hand plus sustained gaze on the seal replaces the two-hand hold; Gaze + pinch uses head direction
to inspect and a hand ray to select; low-risk actions can be approved with a pinch. Poke the settings puck for
input, contrast, text size, captions and reduced motion. Cyclone is used with hands; if controllers are in hand it
asks you to put them down. [Quest: "Completed hands-only on Quest 3."] The emulated-hands run passes end to end.

## Gallery order

1. `cover.png`: Cyclone, Rehearse. Reshape. Decide. Original concept artwork; application captures follow.
2. `amend.png`: Amend robot-arm velocity from 250 to 180°/s and compare the rehearsal paths. Actual emulator capture.
3. `inspect.png`: Inspect a held conveyor action. Actual emulator capture; simulated execution.
4. `locked.png`: A forbidden 450°C oven action locks the execute slot. Actual emulator capture; simulated execution.
5. `receipt.png`: A locally signed demo receipt with retained rehearsal evidence. No official issuer or physical execution claim.
6. `access.png`: Desk settings at 125% text size, with theme and caption controls. Actual emulator capture.

## Other fields to update after the device session

- `meta_capabilities`: replace "Physical Quest 3/3S performance, native room anchoring and narrow-field validation remain pending" with what was measured.
- `target_launch`: unchanged ("Tentative public beta: Q1 2027"), pending H6.
- Video: swap in the revision-2 YouTube link only if the re-cut is approved and uploaded.
