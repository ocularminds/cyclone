# Video — revision 3 and capture mode (C47)

[Watch the 2:00 HD demo on YouTube](https://youtu.be/bEx3UlCG-IE) · [Review the MP4](app/public/video/cyclone-revision3.mp4).
The current file is **119.985333 seconds, 1920×1080, 30 fps, H.264/AAC**. It was published publicly on
17 November 2026. The YouTube watch page plays at 1920×1080 without a media error; its transcoded duration
is 120.021 seconds. The existing Devpost submission embeds this upload and remains Submitted.
[Publication evidence](docs/revision3/video/chrome/youtube.json), [HD playback](docs/revision3/video/chrome/youtube-1080p.jpg),
and [published title and description](docs/revision3/video/chrome/UPLOAD.md) record the result.

This is actual app canvas and WebAudio recorded in external Google Chrome with the installed Immersive Web
Emulator 2.0.0 extension, emulating Meta Quest 3 with IWER 2.3.0. Both the app and synthetic-room canvases
rendered natively at **3840×2160**. The final edit downsamples its crops, which keeps small text clear.
The application design, revision-3 editorial layout, captions, sequence, durations and normal playback speed
are unchanged. [Edit provenance](docs/revision3/video/chrome/edit.json) records exact cuts and source hashes.

The persistent label says **Emulator footage · simulated execution**. The room and hands are synthetic.
No real machine is connected; demo signatures use a local key. A rehearsal is not a prediction or guarantee,
and a signed approval is not an execution receipt. Physical Quest performance/room/FoV validation, provisioned
live-service acceptance and the repository's real-headset footage requirement remain separate open checks.
The [competition rules](https://start-developer-competition-26.devpost.com/rules) allow equivalent emulator footage.

## Finished edit

| Time | Recorded beat / retained caption |
|---|---|
| 0:00.0–0:03.6 | A held action lands on your desk |
| 0:03.6–0:07.9 | Pull to rehearse. The breach flares at the walkway. |
| 0:07.9–0:13.2 | Twist 250 to 180°/s. The breach clears. |
| 0:13.2–0:17.5 | Both hands for 1.5 s. Sealed as reviewed. |
| 0:17.5–0:21.0 | Rehearse. Reshape. Decide. Hands only, on your desk. |
| 0:21.0–0:29.0 | A shift begins: each held action drops into the tray |
| 0:29.0–0:41.0 | Look to inspect. Place a routine action in the slot. |
| 0:41.0–0:49.5 | Compare the original and amended paths |
| 0:49.5–0:56.0 | Let go during a hold: cancelled, nothing sent |
| 0:56.0–1:03.5 | A hard limit locks the execute slot |
| 1:03.5–1:11.1 | Push it off the desk edge to veto |
| 1:11.1–1:18.9 | Routine-looking requests still need review |
| 1:18.9–1:27.3 | Drill revealed after the decision: the rehearsal clips the shelf |
| 1:27.3–1:35.4 | Pick up a seal to replay what you reviewed |
| 1:35.4–1:42.4 | Demo signature. Approval, proof and execution stay separate. |
| 1:42.4–1:47.2 | Gaze + pinch and one-hand alternatives |
| 1:47.2–1:51.7 | Larger text and high contrast |
| 1:51.7–1:59.9 | Cyclone — the calm eye where humans decide what AI agents do. |

The cold open demonstrates the arm review, amendment and hold, then the shift shows the four scenarios,
receipt evidence and access controls. Veto is recorded at the fallback plinth edge; this does not claim a
detected real desk. The end card uses the four seals from the captured workflow, with an empty tray and idle
machines. There is no narration or added music. Editorial captions accompany the real app audio.

## Capture modes and reproduction

| URL | Behaviour |
|---|---|
| `?capture=1` | Isolated deterministic first shift: fixed seed/epoch, stable bindings/glyphs and captions on. |
| `?capture=endcard` | The captured session's seals in one row; no held tokens, idle machines, no HUD/captions/ghost, ambient hum only. |

Follow the [external Chrome capture instructions](docs/revision3/video/chrome/README.md). The local server is
`app/tests/e2e/chrome-capture-server.mjs`; `chrome-capture.mjs` drives actual emulator hand/head input through
the existing app's gesture handling. A native 3840×2160 CSS viewport is required: increasing device scale alone
does not enlarge the XR app framebuffer. Only extension controls/gizmos are hidden while recording.

The three new takes passed **28 capture checks**: 17 workflow, 6 receipt/settings and 5 end-card checks.
TypeScript and the production build pass. [Final QA](docs/revision3/video/chrome/qa.json) includes media
metadata, decoding and crop checks. Rebuild with `python3 docs/revision3/video/chrome/edit.py` using Pillow
and ffmpeg. [Captions](docs/revision3/video/chrome/cyclone-revision3.srt) and a
[transcript](docs/revision3/video/chrome/transcript.txt) are included.

## Earlier versions

The original [2:49 revision-1 upload](https://youtu.be/NaKl8JTSMP4) and its
[publication record](docs/revision1/video/youtube.json) remain available as history.
The earlier revision-3 recording is retained under `docs/revision3/video/`; its MP4 is superseded by this
external Chrome recapture. The current source takes and rebuild script are in `docs/revision3/video/chrome/`.
