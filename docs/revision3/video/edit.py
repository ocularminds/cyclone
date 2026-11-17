"""Revision 3 edit: the revision-2 cold open, re-shot crisp with the emulator room visible.

Same rules: only real emulator takes, every segment at normal speed, no generated or substitute
footage. Sources are new HD takes (docs/revision3/video): the headed IWSDK emulator window in Chrome for
Testing, 1440×810 CSS at 2× density, recorded by tests/e2e/video-hd-start.mjs as the emulator's room
layer plus the application's actual canvas at 1920×1080 with the app's audio mix. The emulator's own
control overlay and gizmos are hidden. Each segment crops a 2:1 window and scales it into the 1920×960
area between the header and footer bars. Run with Python 3 + Pillow and ffmpeg/ffprobe on PATH:

    python3 docs/revision3/video/edit.py
"""
import hashlib
import json
import shutil
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
RAW = HERE
OUTPUT = ROOT / "app/public/video/cyclone-revision3.mp4"
FONT = ROOT / "app/public/assets/fonts/manrope700.ttf"
BODY = ROOT / "app/public/assets/fonts/atkinson400.ttf"
INK = "#0b1b23"
MIN_FREE = 3 * 1024 ** 3

# 2:1 crop windows in 1920×1080 source pixels (x, y, w, h), chosen from contact sheets of each take.
EARLY = (240, 360, 1440, 720)   # first-shift bloom: the room with the desk at the bottom
HOOK = (560, 160, 1280, 640)    # arm token arriving
ZOOM = (640, 200, 1120, 560)    # card + walkway flare + dial
HOLD = (420, 330, 1500, 750)    # card, slot, both palms, seal landing
MAIN = (300, 200, 1520, 760)    # rest of the workflow take
DETAIL = (520, 250, 1400, 700)  # seal pickup, receipt and settings take
END = (420, 380, 1080, 540)     # application end-card scene

HOOK_TEXT = "An AI agent wants to run this robot arm at 250°/s beside a walkway."

# (source, in, out, crop, caption, style)
SEGMENTS = [
    ("workflow", 27.5, 31.1, HOOK, "A held action lands on your desk", "hook"),
    ("workflow", 37.3, 41.6, ZOOM, "Pull to rehearse. The breach flares at the walkway.", "plain"),
    ("workflow", 48.0, 53.3, ZOOM, "Twist 250 to 180°/s. The breach clears.", "plain"),
    ("workflow", 138.1, 142.4, HOLD, "Both hands for 1.5 s. Sealed as reviewed.", "plain"),
    ("endcard", 0, 3.5, END, "Rehearse. Reshape. Decide.|Hands only, on your desk.", "card"),
    ("workflow", 3.0, 11.0, EARLY, "A shift begins: each held action drops into the tray", "plain"),
    ("workflow", 14.5, 26.5, MAIN, "Look to inspect. Place a routine action in the slot.", "plain"),
    ("workflow", 79.0, 87.5, MAIN, "Compare the original and amended paths", "plain"),
    ("workflow", 114.0, 120.5, MAIN, "Let go during a hold: cancelled, nothing sent", "plain"),
    ("workflow", 152.0, 159.5, MAIN, "A hard limit locks the execute slot", "plain"),
    ("workflow", 166.1, 173.7, MAIN, "Push it off the desk edge to veto", "plain"),
    ("workflow", 181.0, 188.8, MAIN, "Routine-looking requests still need review", "plain"),
    ("workflow", 188.8, 197.2, MAIN, "Drill revealed after the decision: the rehearsal clips the shelf", "plain"),
    ("details", 4.9, 13.0, DETAIL, "Pick up a seal to replay what you reviewed", "plain"),
    ("details", 28.0, 35.0, DETAIL, "Demo signature. Approval, proof and execution stay separate.", "plain"),
    ("details", 61.2, 66.0, DETAIL, "Gaze + pinch and one-hand alternatives", "plain"),
    ("details", 80.0, 84.5, DETAIL, "Larger text and high contrast", "plain"),
    ("endcard", 0, 8.2, END, "Cyclone — the calm eye where humans decide what AI agents do.", "plain"),
]


def check_disk():
    free = shutil.disk_usage(str(ROOT)).free
    if free < MIN_FREE:
        raise SystemExit(f"Only {free / 1024 ** 3:.1f} GB free; need 3 GB. Aborting.")


S = 1.5  # graphics were laid out at 1280×720


def centered(draw, y, text, font, fill):
    draw.text(((1920 - draw.textlength(text, font=font)) / 2, y * S), text, font=font, fill=fill)


def wrap(draw, text, font, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = f"{line} {w}".strip()
        if draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            lines.append(line)
            line = w
    return lines + [line]


def graphic(path, caption, style):
    g = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    f = lambda path, size: ImageFont.truetype(str(path), round(size * S))
    heading, small, footer = f(FONT, 20), f(BODY, 20), f(BODY, 24)
    d.rectangle((0, 0, 1919, 53), fill=INK)
    d.text((26 * S, 5 * S), "CYCLONE  /  HANDS-FIRST DEMO", font=heading, fill="#eef4f5")
    label = "Emulator footage · simulated execution"
    d.text((1881 - d.textlength(label, font=small), 6 * S), label, font=small, fill="#b9cbd3")
    d.rectangle((0, 1014, 1919, 1079), fill=INK)
    if style == "card":
        big, sub = f(FONT, 64), f(BODY, 32)
        title, line = caption.split("|")
        d.rectangle((0, 54, 1919, 1013), fill=(11, 27, 35, 190))
        centered(d, 290, title, big, "#eef4f5")
        centered(d, 385, line, sub, "#9fe3ea")
    else:
        if style == "hook":
            hook = f(FONT, 40)
            lines = wrap(d, HOOK_TEXT, hook, 1080 * S)
            top = 70
            d.rounded_rectangle((70 * S, (top - 18) * S, 1210 * S, (top + 54 * len(lines) + 6) * S), radius=round(14 * S), fill=(11, 27, 35, 225))
            for i, ln in enumerate(lines):
                centered(d, top + i * 54, ln, hook, "#eef4f5")
        centered(d, 684, caption, footer, "#eef4f5")
    g.save(path)


def encode(work, item):
    i, (source, start, end, crop, caption, style) = item
    overlay = work / f"{i:02}.png"
    graphic(overlay, caption, style)
    clip = work / f"{i:02}.mp4"
    duration = end - start
    x, y, w, h = crop
    vf = (f"[0:v]crop={w}:{h}:{x}:{y},scale=1920:960:flags=lanczos,pad=1920:1080:0:54:color={INK},"
          f"setsar=1,fps=30[v];[v][1:v]overlay=0:0[vout]")
    args = [shutil.which("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-ss", str(start), "-i", str(RAW / f"{source}.webm"),
            "-loop", "1", "-i", str(overlay), "-t", str(duration), "-filter_complex_threads", "1",
            "-filter_complex", vf, "-map", "[vout]", "-map", "0:a:0",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-threads", "2", "-pix_fmt", "yuv420p", "-r", "30",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
            "-af", f"afade=t=in:d=0.03,afade=t=out:st={duration - .03}:d=0.03", str(clip)]
    done = subprocess.run(args, text=True, capture_output=True)
    if done.returncode:
        raise RuntimeError(done.stderr[-2000:])
    print(f"Encoded {i + 1}/{len(SEGMENTS)}: {source} {start}–{end}", flush=True)
    return clip


def main():
    check_disk()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="cyclone-revision3-video-"))
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            clips = list(pool.map(lambda it: encode(work, it), enumerate(SEGMENTS)))
        check_disk()
        listing = work / "concat.txt"
        listing.write_text("\n".join(f"file '{p}'" for p in clips) + "\n")
        subprocess.run([shutil.which("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
                        "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
                        "-movflags", "+faststart", "-metadata", "title=Cyclone — hands-first demo (revision 3)",
                        "-metadata", "comment=Actual IWSDK emulator footage, cropped and reordered; every segment at normal speed. Demo signatures and simulated execution; no physical machine operation.",
                        str(OUTPUT)], check=True, capture_output=True)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    probe = json.loads(subprocess.check_output([shutil.which("ffprobe"), "-v", "error", "-show_format", "-show_streams", "-of", "json", str(OUTPUT)]))
    assert float(probe["format"]["duration"]) < 180
    assert {s["codec_type"] for s in probe["streams"]} == {"audio", "video"}
    offset, timeline = 0.0, []
    for source, start, end, crop, caption, style in SEGMENTS:
        timeline.append({"source": source + ".webm", "in": start, "out": end, "at": round(offset, 3), "crop": list(crop),
                         "caption": caption.replace("|", " "), "overlay": style, "speed": 1})
        offset += end - start
    metadata = {"source": "New HD takes: the IWSDK emulator room layer plus the actual application canvas and WebAudio, recorded at 1920×1080 from the headed emulator window; two hand-driven takes plus the still end-card capture. Reordered into a cold open, cropped and scaled into a 1920×960 picture area.",
                "claims": "Emulated input, demo signatures, simulated execution. No live authorization or physical-device claim.",
                "output": str(OUTPUT.relative_to(ROOT)), "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
                "timeline": timeline,
                "sources": {s: hashlib.sha256((RAW / f"{s}.webm").read_bytes()).hexdigest() for s in sorted({x[0] for x in SEGMENTS})},
                "probe": probe}
    (HERE / "edit.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"file": str(OUTPUT), "duration": probe["format"]["duration"], "bytes": probe["format"]["size"], "sha256": metadata["sha256"]}), flush=True)


if __name__ == "__main__":
    main()
