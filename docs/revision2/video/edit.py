"""Revision 2 edit: cold open on the robot-arm review, app canvas filling the frame.

Same rules as revision 1: only real emulator takes, every segment at normal speed, no generated or
substitute footage. Sources are the revision-1 MediaRecorder exports (756×469 canvas); each segment
crops a 2:1 window of that canvas and scales it into the 1280×640 area between the header and footer
bars. Run with Python 3 + Pillow and ffmpeg/ffprobe on PATH:

    python3 docs/revision2/video/edit.py
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
RAW = ROOT / "docs/revision1/video"
OUTPUT = ROOT / "app/public/video/cyclone-revision2.mp4"
FONT = ROOT / "app/public/assets/fonts/manrope700.ttf"
BODY = ROOT / "app/public/assets/fonts/atkinson400.ttf"
INK = "#0b1b23"
MIN_FREE = 3 * 1024 ** 3

# 2:1 crop windows in source pixels (x, y, w, h), chosen from contact sheets of each take.
EARLY = (120, 218, 500, 250)   # first-shift bloom: desk sits low in the frame
HOOK = (200, 110, 520, 260)    # arm token arriving
ZOOM = (260, 100, 480, 240)    # card + walkway flare + dial
HOLD = (260, 150, 480, 240)    # slot, both palms, seal landing
MID = (180, 110, 560, 280)     # rest of the workflow take
NEAR = (200, 110, 556, 278)    # conveyor inspect and place
DETAIL = (196, 140, 560, 280)  # seal pickup, receipt and settings take
END = (150, 100, 440, 220)     # application end-card scene

HOOK_TEXT = "An AI agent wants to run this robot arm at 250°/s beside a walkway."

# (source, in, out, crop, caption, style)
SEGMENTS = [
    ("workflow", 25.5, 28.6, HOOK, "A held action lands on your desk", "hook"),
    ("workflow", 33.8, 37.8, ZOOM, "Pull to rehearse. The breach flares at the walkway.", "plain"),
    ("workflow", 44.8, 48.6, ZOOM, "Twist 250 to 180°/s. The breach clears.", "plain"),
    ("workflow", 125.9, 130.1, HOLD, "Both hands for 1.5 s. Sealed as reviewed.", "plain"),
    ("endcard", 0, 4, END, "Rehearse. Reshape. Decide.|Hands only, on your desk.", "card"),
    ("workflow", 2.0, 11.8, EARLY, "A shift begins: each held action drops into the tray", "plain"),
    ("workflow", 11.8, 24.5, NEAR, "Look to inspect. Place a routine action in the slot.", "plain"),
    ("workflow", 70.5, 79.5, MID, "Compare the original and amended paths", "plain"),
    ("workflow", 102.5, 109.5, MID, "Let go during a hold: cancelled, nothing sent", "plain"),
    ("workflow", 137, 146, MID, "A hard limit locks the execute slot", "plain"),
    ("workflow", 152.5, 160.5, MID, "Push it off the desk edge to veto", "plain"),
    ("workflow", 166, 174.6, MID, "Routine-looking requests still need review", "plain"),
    ("workflow", 174.6, 183, MID, "Drill revealed after the decision: the rehearsal clips the shelf", "plain"),
    ("details", 5, 14, DETAIL, "Pick up a seal to replay what you reviewed", "plain"),
    ("details", 27, 35, DETAIL, "Demo signature. Approval, proof and execution stay separate.", "plain"),
    ("details", 58, 63, DETAIL, "Gaze + pinch and one-hand alternatives", "plain"),
    ("details", 76, 81, DETAIL, "Larger text and high contrast", "plain"),
    ("endcard", 0, 8, END, "Cyclone — the calm eye where humans decide what AI agents do.", "plain"),
]


def check_disk():
    free = shutil.disk_usage(str(ROOT)).free
    if free < MIN_FREE:
        raise SystemExit(f"Only {free / 1024 ** 3:.1f} GB free; need 3 GB. Aborting.")


def centered(draw, y, text, font, fill):
    draw.text(((1280 - draw.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)


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
    g = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    heading = ImageFont.truetype(str(FONT), 20)
    small = ImageFont.truetype(str(BODY), 20)
    d.rectangle((0, 0, 1279, 35), fill=INK)
    d.text((26, 5), "CYCLONE  /  HANDS-FIRST DEMO", font=heading, fill="#eef4f5")
    label = "Emulator footage · simulated execution"
    d.text((1254 - d.textlength(label, font=small), 6), label, font=small, fill="#b9cbd3")
    d.rectangle((0, 676, 1279, 719), fill=INK)
    footer = ImageFont.truetype(str(BODY), 24)
    if style == "card":
        big = ImageFont.truetype(str(FONT), 64)
        sub = ImageFont.truetype(str(BODY), 32)
        title, line = caption.split("|")
        d.rectangle((0, 36, 1279, 675), fill=(11, 27, 35, 190))
        centered(d, 290, title, big, "#eef4f5")
        centered(d, 385, line, sub, "#9fe3ea")
        centered(d, 684, "Rehearse. Reshape. Decide.", footer, "#eef4f5")
    else:
        if style == "hook":
            hook = ImageFont.truetype(str(FONT), 40)
            lines = wrap(d, HOOK_TEXT, hook, 1080)
            top = 70
            d.rounded_rectangle((70, top - 18, 1210, top + 54 * len(lines) + 6), radius=14, fill=(11, 27, 35, 225))
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
    vf = (f"[0:v]crop={w}:{h}:{x}:{y},scale=1280:640:flags=lanczos,pad=1280:720:0:36:color={INK},"
          f"setsar=1,fps=30[v];[v][1:v]overlay=0:0[vout]")
    args = [shutil.which("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-ss", str(start), "-i", str(RAW / f"{source}.webm"),
            "-loop", "1", "-i", str(overlay), "-t", str(duration), "-filter_complex_threads", "1",
            "-filter_complex", vf, "-map", "[vout]", "-map", "0:a:0",
            "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-threads", "2", "-pix_fmt", "yuv420p", "-r", "30",
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
    work = Path(tempfile.mkdtemp(prefix="cyclone-revision2-video-"))
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            clips = list(pool.map(lambda it: encode(work, it), enumerate(SEGMENTS)))
        check_disk()
        listing = work / "concat.txt"
        listing.write_text("\n".join(f"file '{p}'" for p in clips) + "\n")
        subprocess.run([shutil.which("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
                        "-c", "copy", "-movflags", "+faststart", "-metadata", "title=Cyclone — hands-first demo (revision 2)",
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
    metadata = {"source": "Actual IWSDK IWER canvas and WebAudio from the revision-1 takes: two hand-driven takes plus the still end-card capture. Reordered into a cold open, cropped and scaled (756×469 canvas → 1280×640 picture area).",
                "claims": "Emulated input, demo signatures, simulated execution. No live authorization or physical-device claim.",
                "output": str(OUTPUT.relative_to(ROOT)), "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
                "timeline": timeline,
                "sources": {s: hashlib.sha256((RAW / f"{s}.webm").read_bytes()).hexdigest() for s in sorted({x[0] for x in SEGMENTS})},
                "probe": probe}
    (HERE / "edit.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"file": str(OUTPUT), "duration": probe["format"]["duration"], "bytes": probe["format"]["size"], "sha256": metadata["sha256"]}), flush=True)


if __name__ == "__main__":
    main()
