"""Rebuild revision 3 from the external Chrome / Quest extension recordings.

Keeps the existing revision-3 graphics, caption text, sequence, shot durations,
normal playback speed, and framing. Native 3840×2160 source pixels replace the
earlier 1920×1080 composite. Every crop is downsampled, never enlarged.
"""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("revision3_graphics", HERE.parent / "edit.py")
edit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edit)


def markers(name):
    data = json.loads((HERE / f"{name}.json").read_text())
    assert data["canvas"] == [3840, 2160], f"{name} was not captured at native 4K"
    assert all(c["ok"] for c in data["checks"]), f"{name} has a failed capture check"
    return {e["mark"]: e["seconds"] for e in data["events"] if "mark" in e}


def timecode(seconds):
    ms = round(seconds * 1000)
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def main():
    w, d = markers("workflow"), markers("details")
    markers("endcard")
    starts = [
        w["arm-inspect"] - .7,
        w["scrub-complete"] - 2.3,
        w["amend-start"] + .2,
        w["hold-start"] - .3,
        0,
        3,
        w["conveyor-inspect"] - 2.4,
        w["compare-start"] + .15,
        w["abort-start"] - .1,
        w["oven-lock-start"] - 1.6,
        w["veto-start"] - .7,
        w["pallet-inspect"] - 1,
        w["drill-revealed"] - 1.2,
        d["receipt-open"] - .3,
        d["demo-proof"] + .2,
        d["input-controls"] + .2,
        d["larger-text"] + .2,
        0,
    ]
    original = list(edit.SEGMENTS)
    edit.SEGMENTS = []
    for start, (source, old_in, old_out, crop, caption, style) in zip(starts, original, strict=True):
        crop = tuple(n * 2 for n in crop)
        assert crop[2] >= 1920 and crop[3] >= 960, "Upscaling would soften text"
        edit.SEGMENTS.append((source, round(start, 4), round(start + old_out - old_in, 4), crop, caption, style))
    edit.RAW = HERE
    edit.HERE = HERE
    edit.main()

    manifest_path = HERE / "edit.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["source"] = "Actual external Google Chrome, installed Immersive Web Emulator 2.0.0 (Meta Quest 3, IWER 2.3.0), synthetic hands only. App and synthetic-room canvases both render natively at 3840×2160 and are captured with the application's actual WebAudio mix. Existing revision-3 graphics, captions, pacing and crop framing are retained; source crops are downsampled to 1920×960, with no upscaling."
    manifest["app_base_commit"] = "f9f40c7"
    manifest["application_design_changed"] = False
    manifest["capture_url"] = "http://cyclone.localhost:8082/?mode=onboarding&capture=1"
    manifest["native_source_resolution"] = [3840, 2160]
    manifest["capture_checks"] = {name: json.loads((HERE / f"{name}.json").read_text())["checks"] for name in ["workflow", "details", "endcard"]}
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    captions, transcript, elapsed = [], [], 0.0
    for i, (source, start, end, crop, caption, style) in enumerate(edit.SEGMENTS, 1):
        stop = elapsed + end - start
        text = caption.replace("|", "\n")
        captions.append(f"{i}\n{timecode(elapsed)} --> {timecode(stop)}\n{text}\n")
        transcript.append(f"{timecode(elapsed)[:8]}  {text.replace(chr(10), ' ')}")
        elapsed = stop
    (HERE / "cyclone-revision3.srt").write_text("\n".join(captions), encoding="utf-8")
    (HERE / "transcript.txt").write_text("No narration; the following captions accompany the actual app audio.\n\n" + "\n".join(transcript) + "\n", encoding="utf-8")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(edit.OUTPUT), "-vf", "fps=1/6.5,scale=480:-1,tile=3x6", "-frames:v", "1", str(HERE / "contact-sheet.jpg")], check=True)


if __name__ == "__main__":
    main()
