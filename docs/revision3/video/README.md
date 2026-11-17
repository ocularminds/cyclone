# Video — revision 3 (HD re-shoot, staged, not uploaded)

`app/public/video/cyclone-revision3.mp4` · 120.0 s · 1920×1080 H.264/AAC · sha256 `e4d8469a3af7…`

Same cold-open structure as revision 2, shot again so it's sharp and shows the emulator's room around the
miniature factory instead of a black void.

## What changed vs revision 2
- **New takes**, not upscaled footage. The headed IWSDK emulator window (Chrome for Testing, GPU, 1440×810 CSS at
  2× density) was recorded at 1920×1080 by `app/tests/e2e/video-hd-start.mjs`. The capture composites the
  emulator's room layer under the application's actual canvas, with the app's WebAudio mix. Revisions 1 and 2
  recorded only the app canvas (756×469), so the room was black.
- The emulator's own control overlay and transform gizmos are hidden during capture. They're tooling, not the app.
- Same scripted hands-only first shift: `CYCLONE_VIDEO=hd node tests/e2e/drive.mjs` passed 27/27 checks during the
  take. The details take (`shoot-details.mjs`) and the end card (`capture.mjs`, 6/6) were recorded the same way.
- Audio loudness-normalised to −16 LUFS (volume only). Earlier revisions averaged about −40 dB.
- Tighter pacing (about 2:00). The duplicate caption under the "Rehearse. Reshape. Decide." card is removed.

## Beats
| Time | Source (s) | Caption |
|---|---|---|
| 0:00.0–0:03.6 | workflow.webm 27.5–31.1 | A held action lands on your desk |
| 0:03.6–0:07.9 | workflow.webm 37.3–41.6 | Pull to rehearse. The breach flares at the walkway. |
| 0:07.9–0:13.2 | workflow.webm 48.0–53.3 | Twist 250 to 180°/s. The breach clears. |
| 0:13.2–0:17.5 | workflow.webm 138.1–142.4 | Both hands for 1.5 s. Sealed as reviewed. |
| 0:17.5–0:21.0 | endcard.webm 0–3.5 | Rehearse. Reshape. Decide. Hands only, on your desk. |
| 0:21.0–0:29.0 | workflow.webm 3.0–11.0 | A shift begins: each held action drops into the tray |
| 0:29.0–0:41.0 | workflow.webm 14.5–26.5 | Look to inspect. Place a routine action in the slot. |
| 0:41.0–0:49.5 | workflow.webm 79.0–87.5 | Compare the original and amended paths |
| 0:49.5–0:56.0 | workflow.webm 114.0–120.5 | Let go during a hold: cancelled, nothing sent |
| 0:56.0–1:03.5 | workflow.webm 152.0–159.5 | A hard limit locks the execute slot |
| 1:03.5–1:11.1 | workflow.webm 166.1–173.7 | Push it off the desk edge to veto |
| 1:11.1–1:18.9 | workflow.webm 181.0–188.8 | Routine-looking requests still need review |
| 1:18.9–1:27.3 | workflow.webm 188.8–197.2 | Drill revealed after the decision: the rehearsal clips the shelf |
| 1:27.3–1:35.4 | details.webm 4.9–13.0 | Pick up a seal to replay what you reviewed |
| 1:35.4–1:42.4 | details.webm 28.0–35.0 | Demo signature. Approval, proof and execution stay separate. |
| 1:42.4–1:47.2 | details.webm 61.2–66.0 | Gaze + pinch and one-hand alternatives |
| 1:47.2–1:51.7 | details.webm 80.0–84.5 | Larger text and high contrast |
| 1:51.7–1:59.9 | endcard.webm 0–8.2 | Cyclone — the calm eye where humans decide what AI agents do. |

## Rebuild
1. `cd app && npx iwsdk dev up --headed --allow-browser-automation`
2. `npx iwsdk browser run tests/e2e/video-hd-viewport.mjs` (16:9 window)
3. `CYCLONE_VIDEO=hd node tests/e2e/drive.mjs`, then `CYCLONE_VIDEO=hd node tests/e2e/shoot-details.mjs`, then `CYCLONE_VIDEO=hd node tests/e2e/capture.mjs`
4. `python3 docs/revision3/video/edit.py` (Python 3 + Pillow, ffmpeg/ffprobe; needs 3 GB free; deletes its temp folder)

## Honesty notes
- Actual emulator footage with synthetic hands, every segment at normal speed. No generated or substitute footage.
- The grey room is the emulator's built-in synthetic environment, not a real room and not headset passthrough.
- Demo signatures and simulated execution; no physical machine is operated. Rehearsals are not predictions.
- The persistent label reads "Emulator footage · simulated execution".
