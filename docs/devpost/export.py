"""Reproduce Devpost's 3:2 artwork from owned art and real emulator captures.

Requires Pillow and ffmpeg. No AI generation, substitute UI, or changed footage.
Run from any directory; fonts, logo and raw takes are versioned in this repository.
"""
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
BRAND = ROOT / "design/brand1/assets"
TAKES = ROOT / "docs/revision1/video"
FONT = ROOT / "app/public/assets/fonts/manrope700.ttf"
BODY = ROOT / "app/public/assets/fonts/atkinson400.ttf"
INK = "#142B36"
PAPER = "#F5F1E8"
CYAN = "#62DCE8"
SIZE = (1800, 1200)
FRAMES = [
    ("inspect", "workflow", 15, "01 / INTERCEPT", "Review the held action",
     "Look to inspect the agent, value, rationale and rule."),
    ("amend", "workflow", 75, "02 / REHEARSE + AMEND", "250°/s → 180°/s",
     "Compare original and proposed paths in a kinematic rehearsal."),
    ("locked", "workflow", 140, "03 / DECIDE", "A hard limit stays locked",
     "450°C in Zone B. Veto or escalate; unresolved actions remain held."),
    ("receipt", "details", 30, "04 / SEAL", "A record you can replay",
     "Demo signature. Retained rehearsal. Permission, proof and execution stay separate."),
    ("access", "details", 78, "05 / ACCESS", "Controls within reach",
     "Text at 125%, with theme and caption controls on the desk."),
]


def font(size, body=False):
    return ImageFont.truetype(str(BODY if body else FONT), size)


def text(draw, xy, value, size, fill=INK, body=False):
    face = font(size, body)
    assert draw.textlength(value, font=face) <= SIZE[0] - 144, value
    draw.text(xy, value, font=face, fill=fill)


def save(image, name):
    image.convert("RGB").save(OUT / name, optimize=True)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


OUT.mkdir(parents=True, exist_ok=True)
(OUT / "frames").mkdir(exist_ok=True)
cover_source = Image.open(BRAND / "cover-1920x1080.png").convert("RGB")
cover = Image.new("RGB", SIZE, cover_source.getpixel((0, 0)))
cover.paste(cover_source.resize((1800, 1012), Image.Resampling.LANCZOS), (0, 40))
cd = ImageDraw.Draw(cover)
cd.line((98, 1100, 1702, 1100), fill="#496068", width=2)
tagline = "The calm eye where humans decide what AI agents do."
face = font(35, True)
cd.text(((1800-cd.textlength(tagline, font=face))/2, 1130), tagline, font=face, fill=PAPER)
save(cover, "cover.png")

logo = Image.open(BRAND / "logo-lockup-ink.png").convert("RGBA")
logo.thumbnail((260, 72), Image.Resampling.LANCZOS)
exports = [{"file": "cover.png", "kind": "concept artwork",
            "source": "design/brand1/assets/cover-1920x1080.png",
            "transforms": "Proportional resize; background padding and exact tagline. No crop."}]
for name, take, seconds, label, title, caption in FRAMES:
    source = TAKES / f"{take}.webm"
    frame_path = OUT / "frames" / f"{name}.png"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                    "-ss", str(seconds), "-i", str(source), "-frames:v", "1", str(frame_path)], check=True)
    frame = Image.open(frame_path).convert("RGB")
    crop = (210, 80, 756, 469)
    frame = frame.crop(crop)
    page = Image.new("RGB", SIZE, PAPER)
    draw = ImageDraw.Draw(page)
    text(draw, (72, 36), label, 24)
    text(draw, (72, 81), title, 56)
    page.paste(logo, (1468, 40), logo)
    display = ImageOps.contain(frame, (1656, 898), Image.Resampling.LANCZOS)
    x, y = (1800-display.width)//2, 167
    page.paste(display, (x, y))
    draw.rectangle((x-1, y-1, x+display.width, y+display.height), outline="#91A3A8", width=2)
    draw.line((72, 1082, 1728, 1082), fill="#C6CEC9", width=2)
    text(draw, (72, 1096), caption, 30, body=True)
    text(draw, (72, 1156), "CROPPED IWSDK EMULATOR CAPTURE  ·  DEMO EXECUTION IS SIMULATED", 21, body=True)
    save(page, name + ".png")
    exports.append({"file": name + ".png", "kind": "real emulator capture with editorial caption",
                    "source": str(source.relative_to(ROOT)), "source_sha256": digest(source),
                    "source_time_seconds": seconds, "frame": f"frames/{name}.png",
                    "crop_px": crop,
                    "transforms": "Crop surrounding black space; proportional resize; separate caption and frame added. UI unchanged.",
                    "caption": caption})

sheet = Image.new("RGB", (1200, 1254), "#142B36")
sd = ImageDraw.Draw(sheet)
for i, item in enumerate(exports):
    preview = Image.open(OUT / item["file"]).resize((582, 388), Image.Resampling.LANCZOS)
    x, y = 12+(i%2)*600, 12+(i//2)*414
    sheet.paste(preview, (x, y))
    sd.text((x, y+390), item["file"], font=font(17, True), fill=PAPER)
sheet.save(OUT / "contact.jpg", quality=92)

for item in exports:
    p = OUT / item["file"]
    assert Image.open(p).size == SIZE
    assert p.stat().st_size < 5_000_000
    item.update(width=1800, height=1200, bytes=p.stat().st_size, sha256=digest(p))
manifest = {"version": 1, "project": "Cyclone", "created": "2026-11-10",
            "destination": "Devpost project 1292406 / Meta VR Start Developer Competition 2026",
            "spec": {"ratio": "3:2", "max_bytes_per_image": 5_000_000, "format": "PNG"},
            "exports": exports, "ai_generated": False,
            "art_source": "Original local Three.js scene in design/brand1/source; concept art is not app evidence.",
            "evidence_scope": "Emulated hands, demo signatures, simulated execution. No physical device, live service or actuator claim.",
            "reproduction": "python3 docs/devpost/export.py",
            "review_status": "Reviewed at full size and on contact sheet; no overlaid or invented app UI. Crops retain decision panels. Not a device legibility check."}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"images": len(exports), "max_bytes": max(x["bytes"] for x in exports), "contact": str(OUT / "contact.jpg")}))
