"""Edit real emulator takes at normal speed; no generated or substitute footage.

Run with the bundled Python/Pillow runtime and ffmpeg on PATH. Inputs are the
three MediaRecorder exports beside this script; output ships as a static asset.
"""
import hashlib
import json
import shutil
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAW = Path(__file__).resolve().parent
ROOT = RAW.parents[2]
WORK = Path(tempfile.mkdtemp(prefix="cyclone-revision1-video-"))
OUTPUT = ROOT / "app/public/video/cyclone-revision1.mp4"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
FONT = ROOT / "app/public/assets/fonts/manrope700.ttf"
BODY = ROOT / "app/public/assets/fonts/atkinson400.ttf"
SEGMENTS = [
    ("workflow", 0, 29, "Every held action lands beside its machine"),
    ("workflow", 29, 50, "Pull to rehearse. Twist 250 to 180 degrees/second."),
    ("workflow", 70, 81, "Compare original and amended paths"),
    ("workflow", 99, 110, "Release cancels the commitment"),
    ("workflow", 119, 134, "Both hands, 1.5 seconds. Record the reviewed action."),
    ("workflow", 136, 147, "Hard limits lock the execute slot"),
    ("workflow", 152, 162, "Push past the plinth edge to veto"),
    ("workflow", 165, 174.6, "Routine-looking requests still need review"),
    ("workflow", 174.6, 183, "Drill revealed after the decision"),
    ("details", 5, 15, "Pick up a seal to replay retained model evidence"),
    ("details", 26, 36, "Demo signature. Permission, proof and execution are separate."),
    ("details", 58, 65, "Gaze + pinch and one-hand alternatives"),
    ("details", 74, 82, "Readable settings at 100% or 125%"),
    ("endcard", 0, 8, "Cyclone — the calm eye where humans decide what AI agents do."),
]


def encode(item):
    i, (source, start, end, caption) = item
    overlay = WORK / f"{i:02}.png"
    graphic = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    draw = ImageDraw.Draw(graphic)
    heading = ImageFont.truetype(str(FONT), 20)
    body = ImageFont.truetype(str(BODY), 20)
    draw.rectangle((0, 0, 1279, 35), fill="#0b1b23")
    draw.text((26, 5), "CYCLONE  /  HANDS-FIRST DEMO", font=heading, fill="#eef4f5")
    label = "Emulator footage · simulated execution"
    draw.text((1254 - draw.textlength(label, font=body), 6), label, font=body, fill="#b9cbd3")
    draw.rectangle((0, 676, 1279, 719), fill="#0b1b23")
    footer = ImageFont.truetype(str(BODY), 24)
    draw.text(((1280 - draw.textlength(caption, font=footer)) / 2, 684), caption, font=footer, fill="#eef4f5")
    graphic.save(overlay)
    clip = WORK / f"{i:02}.mp4"
    duration = end - start
    args = [shutil.which("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-ss", str(start), "-i", str(RAW / f"{source}.webm"),
            "-loop", "1", "-i", str(overlay), "-t", str(duration), "-filter_complex_threads", "1",
            "-filter_complex", "[0:v]scale=1032:640,pad=1280:720:124:36:0x0b1b23,setsar=1[v];[v][1:v]overlay=0:0[vout]",
            "-map", "[vout]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-threads", "2",
            "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
            "-af", f"afade=t=in:d=0.02,afade=t=out:st={duration-.02}:d=0.02", str(clip)]
    done = subprocess.run(args, text=True, capture_output=True)
    (WORK / f"{i:02}.txt").write_text(done.stderr)
    if done.returncode:
        raise RuntimeError(done.stderr)
    print(f"Encoded {i+1}/{len(SEGMENTS)}: {source} {start}–{end}", flush=True)
    return clip


with ThreadPoolExecutor(max_workers=2) as pool:
    clips = list(pool.map(encode, enumerate(SEGMENTS)))
listing = WORK / "concat.txt"
listing.write_text("\n".join(f"file '{p}'" for p in clips) + "\n")
subprocess.run([shutil.which("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
                "-c", "copy", "-movflags", "+faststart", "-metadata", "title=Cyclone — hands-first demo",
                "-metadata", "comment=Actual IWSDK emulator footage. Edited takes at normal speed. Demo signatures and simulated execution; no physical machine operation.",
                str(OUTPUT)], check=True, capture_output=True)
probe = json.loads(subprocess.check_output([shutil.which("ffprobe"), "-v", "error", "-show_format", "-show_streams", "-of", "json", str(OUTPUT)]))
assert float(probe["format"]["duration"]) < 180
assert {s["codec_type"] for s in probe["streams"]} == {"audio", "video"}
offset = 0
timeline = []
for source, start, end, caption in SEGMENTS:
    timeline.append({"source": source + ".webm", "in": start, "out": end, "at": offset, "caption": caption, "speed": 1})
    offset += end - start
metadata = {"source": "Actual IWSDK IWER canvas and WebAudio. Two hand-driven takes, plus a still end-card capture populated by the capture test.",
            "claims": "Emulated input, demo signatures, simulated execution. No live authorization or physical-device claim.",
            "output": str(OUTPUT.relative_to(ROOT)), "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
            "timeline": timeline, "sources": {s: hashlib.sha256((RAW / f"{s}.webm").read_bytes()).hexdigest() for s in {x[0] for x in SEGMENTS}},
            "probe": probe}
(RAW / "edit.json").write_text(json.dumps(metadata, indent=2) + "\n")
print(json.dumps({"file": str(OUTPUT), "duration": probe["format"]["duration"], "bytes": probe["format"]["size"], "sha256": metadata["sha256"]}), flush=True)
