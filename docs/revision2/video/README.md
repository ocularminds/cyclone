# Video — revision 2 (cold open), staged for owner approval

Output: `app/public/video/cyclone-revision2.mp4` · 2:06.6 (126.6 s) · 1280×720 H.264/AAC 30 fps · 5.99 MB ·
sha256 `0739a3521ea678364c3b178c2af775bb427ac78e19eb145f82b760ee2179064c`.
**Not uploaded.** The submitted video stays [revision 1 on YouTube](https://youtu.be/NaKl8JTSMP4) until the owner
approves this cut and swaps the link on Devpost.

## Beats

| Time | Source (revision-1 take, seconds) | Caption |
|---|---|---|
| 0:00.0–0:03.1 | workflow 25.5–28.6 | Hook overlay: "An AI agent wants to run this robot arm at 250°/s beside a walkway." · A held action lands on your desk |
| 0:03.1–0:07.1 | workflow 33.8–37.8 | Pull to rehearse. The breach flares at the walkway. |
| 0:07.1–0:10.9 | workflow 44.8–48.6 | Twist 250 to 180°/s. The breach clears. |
| 0:10.9–0:15.1 | workflow 125.9–130.1 | Both hands for 1.5 s. Sealed as reviewed. |
| 0:15.1–0:19.1 | endcard 0–4 (dimmed) | Title card: "Rehearse. Reshape. Decide." / "Hands only, on your desk." |
| 0:19.1–0:28.9 | workflow 2.0–11.8 | A shift begins: each held action drops into the tray |
| 0:28.9–0:41.6 | workflow 11.8–24.5 | Look to inspect. Place a routine action in the slot. |
| 0:41.6–0:50.6 | workflow 70.5–79.5 | Compare the original and amended paths |
| 0:50.6–0:57.6 | workflow 102.5–109.5 | Let go during a hold: cancelled, nothing sent |
| 0:57.6–1:06.6 | workflow 137–146 | A hard limit locks the execute slot |
| 1:06.6–1:14.6 | workflow 152.5–160.5 | Push it off the desk edge to veto |
| 1:14.6–1:23.2 | workflow 166–174.6 | Routine-looking requests still need review |
| 1:23.2–1:31.6 | workflow 174.6–183 | Drill revealed after the decision: the rehearsal clips the shelf |
| 1:31.6–1:40.6 | details 5–14 | Pick up a seal to replay what you reviewed |
| 1:40.6–1:48.6 | details 27–35 | Demo signature. Approval, proof and execution stay separate. |
| 1:48.6–1:53.6 | details 58–63 | Gaze + pinch and one-hand alternatives |
| 1:53.6–1:58.6 | details 76–81 | Larger text and high contrast |
| 1:58.6–2:06.6 | endcard 0–8 | Cyclone — the calm eye where humans decide what AI agents do. |

`contact-0-30s.jpg` shows frames at 0, 2, 5, 10, 15, 20, 25 and 30 s.

## What changed vs revision 1

- **Cold open.** The robot-arm review (rehearse → breach flare → twist to 180°/s → two-hand hold → seal) now plays in
  the first 15 s, with the hook line overlaid from frame 1. Revision 1 opened on a black screen with outline hands and
  reached the arm at 0:29.
- **App fills the frame.** Revision 1 scaled the whole 756×469 canvas into 1032×640, about 60% of the frame. Each
  segment now crops a 2:1 window around the tabletop (crop rectangles are in `edit.json`) and fills the 1280×640
  picture area between the header and footer bars.
- **Captions change per beat** (18 short captions instead of one 27-second caption).
- **Shorter:** 2:06.6 instead of 2:49. Settings segments are trimmed to 5 s each, and the arm beats already shown in the
  cold open are not repeated in the walkthrough, except the original/amended path comparison.
- Revision-1 files are untouched.

## Honesty notes

- Every frame is actual IWSDK emulator (IWER) canvas and WebAudio from the three revision-1 takes. There is no generated
  or substitute footage. Every segment plays at normal speed; edits are cuts, crops, scaling and overlays only.
- The persistent header reads "Emulator footage · simulated execution". Seals are demo signatures; nothing operates a
  physical machine. Captions say "rehearsal", never "prediction".
- The cold open's hold segment shows the hold ring and seal landing; the emulator's hand outlines are not always drawn
  in that crop.
- Crop-zoom upscales a 756×469 source, so small card text is softer than in a headset. Headline values (250 °/s,
  250 → 180 °/s), the walkway flare and the seal are legible.
- The source background is black because the emulator's room compositor is outside the captured canvas, as in
  revision 1.

## Rebuild

```bash
python3 docs/revision2/video/edit.py   # Python 3 + Pillow, ffmpeg/ffprobe on PATH
```

The script refuses to run with less than 3 GB free, encodes in a `$TMPDIR/cyclone-revision2-video-*` working
directory that it always deletes, and rewrites `edit.json` (source sha256s, cut points, crops, ffprobe output).
