"""Prepare accurate Devpost field text from the versioned submission description."""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
submission = (ROOT / "SUBMISSION.md").read_text()
story = submission.split("## Description\n\n", 1)[1].split("\n## Submission readiness", 1)[0].strip()
lesson = ("**Challenges and lessons.** Keeping a decision, its proof and physical execution separate mattered "
          "more than a convincing animation. Retained model evidence makes later replay honest.")
story = story.replace("**What's next.**", lesson + "\n\n**What's next.**")
assert len(story.split()) < 500
(OUT / "story.md").write_text(story + "\n")
fields = {
    "project_name": "Cyclone",
    "elevator_pitch": "Cyclone — the calm eye where humans decide what AI agents do. Rehearse held actions, reshape them with your hands, and seal each decision at a miniature factory on your desk.",
    "story": story,
    "story_words": len(story.split()),
    "built_with": ["iwsdk", "three.js", "decionis-agentsafe", "ecs", "node.js", "meta-vr", "quest", "typescript", "webxr", "vite", "ed25519"],
    "links": ["https://github.com/ocularminds/cyclone", "https://ocularminds.github.io/cyclone/", "https://ocularminds.github.io/cyclone/submission/cyclone-artifacts.zip"],
    "video": "https://www.youtube.com/watch?v=NaKl8JTSMP4",
    "meta_capabilities": "WebXR mixed reality with Meta's IWSDK 1.0.1: tracked-hand grab/pinch and poke interactions, head-directed gaze plus pinch, passthrough-compatible tabletop rendering, a table-plane/anchor path with a timed fallback plinth, and positional machine audio. Risk uses shape, motion, hatching and blue/amber/magenta. Captioned cues, larger text, high contrast and reduced motion are available in desk settings.\n\nThe complete four-scenario demo is verified with emulated hands. Physical Quest 3/3S performance, native room anchoring and narrow-field validation remain pending. The video is actual IWSDK IWER emulator footage with simulated execution.",
    "hand_interactions": "Look at a held token to inspect its agent, action, rationale and policy rule. Pinch the timeline handle and pull to scrub the machine's kinematic rehearsal. Grab and twist the dial to change the robot arm from 250 to 180 degrees/second; compare the original and amended paths.\n\nPlace a routine token in the execute slot. Critical actions require both hands for 1.5 seconds while the rehearsal runs; releasing either hand cancels the hold. Push past the desk/plinth edge to veto. Forbidden actions lock the execute slot. Placing a token on the escalation pad leaves it held for review. Pick up a seal to replay retained evidence; accept a bounded demo rule by moving it onto the agent.\n\nA preferred-hand plus sustained-gaze hold provides the one-hand alternative. Head-directed gaze plus pinch can select controls and approve low-risk actions. Poke the settings puck to reach named, paged controls for input, contrast, text size, captions and reduced motion. The workflow has been completed with emulated hands and no controllers; physical-device acceptance remains pending.",
    "vr_future": "VR can give human judgment a useful place in increasingly automated work. An action with spatial consequences should be something a person can inspect, rehearse and change in the same space, using familiar hand movements. We are excited about smaller, everyday headsets making that review practical at a desk. Cyclone explores this through a miniature factory: a clear view of the proposed action, a reversible rehearsal, a deliberate gesture and an honest record of what was reviewed. Better sensing and lighter hardware could make this form of oversight more accessible without pretending that an animation guarantees an outcome.",
    "target_launch": "Tentative public beta: Q1 2027. Current WebXR demo is public.",
    "gallery": ["cover.png", "inspect.png", "amend.png", "locked.png", "receipt.png", "access.png"],
    "gallery_captions": [
        "Cyclone — Rehearse. Reshape. Decide. Original concept artwork; application captures follow.",
        "Inspect a held conveyor action. Actual emulator capture; simulated execution.",
        "Amend robot-arm velocity from 250 to 180 degrees/second and compare the rehearsal paths. Actual emulator capture.",
        "A forbidden 450°C oven action locks the execute slot. Actual emulator capture; simulated execution.",
        "Inspect a locally signed demo receipt and replay retained rehearsal evidence. No official issuer or physical execution claim.",
        "Desk settings at 125% text size, with theme and caption controls. Actual emulator capture."
    ],
    "account_fields": "Private account fields and eligibility declarations are excluded from this public content pack."
}
assert len(fields["elevator_pitch"]) <= 200
assert len(fields["vr_future"].split()) <= 150
(OUT / "fields.json").write_text(json.dumps(fields, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"story_words": fields["story_words"], "pitch_characters": len(fields["elevator_pitch"])}))
