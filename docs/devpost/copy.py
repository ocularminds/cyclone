"""Generate the published Devpost fields from the approved revision-2 copy."""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
copy = (OUT / "revision2.md").read_text()


def section(title):
    return copy.split("## " + title + "\n\n", 1)[1].split("\n## ", 1)[0].strip()


story = section("Story")
gallery = []
captions = []
for line in section("Gallery order").splitlines():
    _, filename, caption = line.split("`", 2)
    gallery.append(filename)
    captions.append(caption.removeprefix(": "))
assert "[Quest:" not in story
assert len(story.split()) < 500
(OUT / "story.md").write_text(story + "\n")
fields = {
    "project_name": "Cyclone",
    "elevator_pitch": section("Elevator pitch"),
    "story": story,
    "story_words": len(story.split()),
    "built_with": ["iwsdk", "three.js", "decionis-agentsafe", "ecs", "node.js", "meta-vr", "quest", "typescript", "webxr", "vite", "ed25519"],
    "links": ["https://github.com/ocularminds/cyclone", "https://ocularminds.github.io/cyclone/", "https://ocularminds.github.io/cyclone/submission/cyclone-artifacts.zip"],
    "video": "https://www.youtube.com/watch?v=bEx3UlCG-IE",
    "meta_capabilities": "WebXR mixed reality with Meta's IWSDK 1.0.1: tracked-hand grab/pinch and poke interactions, head-directed inspection with pinch/ray controls, passthrough-compatible tabletop rendering, a table-plane/anchor path with a timed fallback plinth, and positional machine audio. Risk uses shape, motion, hatching and blue/amber/magenta. Captioned cues, larger text, high contrast and reduced motion are available in desk settings.\n\nThe complete four-scenario demo is verified with emulated hands. Physical Quest 3/3S performance, native room anchoring and narrow-field validation remain pending. The video is actual Immersive Web Emulator footage recorded in external Chrome with the Meta Quest 3 emulator, with simulated execution.",
    "hand_interactions": section("Hand interactions (field)"),
    "vr_future": "VR can give human judgment a useful place in increasingly automated work. An action with spatial consequences should be something a person can inspect, rehearse and change in the same space, using familiar hand movements. We are excited about smaller, everyday headsets making that review practical at a desk. Cyclone explores this through a miniature factory: a clear view of the proposed action, a reversible rehearsal, a deliberate gesture and an honest record of what was reviewed. Better sensing and lighter hardware could make this form of oversight more accessible without pretending that an animation guarantees an outcome.",
    "target_launch": "Tentative public beta: Q1 2027. Current WebXR demo is public.",
    "gallery": gallery,
    "gallery_captions": captions,
    "account_fields": "Private account fields and eligibility declarations are excluded from this public content pack."
}
assert len(fields["elevator_pitch"]) <= 200
assert len(gallery) == len(captions) == 6
assert all(len(caption) <= 140 for caption in captions)
assert len(fields["vr_future"].split()) <= 150
(OUT / "fields.json").write_text(json.dumps(fields, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"story_words": fields["story_words"], "pitch_characters": len(fields["elevator_pitch"])}))
