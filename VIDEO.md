# Video — finished workflow and capture mode (C47)

[Watch the 2:49 revision video on YouTube](https://youtu.be/NaKl8JTSMP4) · [Download the MP4](https://ocularminds.github.io/cyclone/video/cyclone-revision1.mp4).
The versioned file is `app/public/video/cyclone-revision1.mp4`: 169.017 seconds, 1280×720 H.264/AAC.
[Edit provenance](docs/revision1/video/edit.json) records source hashes, normal-speed cut points and ffprobe output.

This is actual IWSDK Immersive Web Emulator canvas and WebAudio, recorded from two hand-driven takes and the
application's end-card scene. The persistent banner says **Emulator footage · simulated execution**. There is
no generated footage, substituted UI, live authorization claim or physical machine operation. The emulator's
room compositor is outside the captured app canvas, so the recorded background is black.

The [current competition rules](https://start-developer-competition-26.devpost.com/rules) allow emulator
footage and require a public YouTube or Vimeo video under three minutes. The [YouTube upload](https://youtu.be/NaKl8JTSMP4)
was published on 10 November 2026; its watch page plays at 1280×720 with a duration of 169.041 seconds.
[Publication evidence](docs/revision1/video/youtube.json) and the [confirmation](docs/revision1/video/youtube-published.jpg)
record the actual upload and playback. The Pages MP4 remains a downloadable review copy.
[Published title and description](docs/revision1/video/UPLOAD.md) accompany both versions.
The repository's stricter H4 request for real-headset footage is still a separate unfulfilled requirement (D55).

## Finished edit

| Time | Actual recorded beat |
|---|---|
| 0:00–0:29 | Factory bloom, first conveyor token, inspect and place approval; demo receipt lands. |
| 0:29–0:50 | Arm rehearsal: pull the timeline, twist 250→180°/s, breach clears. |
| 0:50–1:01 | Compare retained original and amended paths under the same model. |
| 1:01–1:12 | Early release cancels the two-hand commitment. |
| 1:12–1:27 | Fresh placement, full 1.5-second two-hand hold and amended demo receipt. |
| 1:27–1:38 | Forbidden oven: the execute slot locks. |
| 1:38–1:48 | Push past the plinth edge to veto. This does not claim a detected real desk. |
| 1:48–2:06 | Routine-looking pallet lift, decision, then drill reveal and missed-breach rehearsal. |
| 2:06–2:16 | Physical seal pickup and retained model evidence. |
| 2:16–2:26 | Receipt proof detail explicitly says Demo signature; permission, proof and execution stay distinct. |
| 2:26–2:33 | Actual Input settings: Gaze + pinch and preferred-hand alternatives. |
| 2:33–2:41 | Actual Display settings and 125% text. |
| 2:41–2:49 | Application end card: idle machines, empty tray, evenly spaced seals, ambient sound and tagline. |

This preserves BRIEF §14's core sequence: arrival, spatial review, amendment/hold, forbidden veto, drill,
record detail, access controls and calm tabletop close. The optional editorial JSON-prompt insert and a live
split screen are absent. A real-desk opening, passthrough contrast and physical narrow-FoV shots await H3/H4.
A local signature is not an official live attestation; an authorization is not an execution receipt.

## Capture modes and reproduction

| URL | Behaviour |
|---|---|
| `?capture=1` | Isolated deterministic first shift: fixed seed/epoch, same bindings and glyphs, quantised timestamps, captions on, no random drills. |
| `?capture=endcard` | Loads the preceding capture session's seals in one row; no scenario, no held tokens, idle machines, no HUD/captions/ghost, ambient hum only. |

`app/tests/e2e/capture.mjs` passes 6/6 checks, including identical first-intent hashes and an end card with four
seals and no tokens. `video-start.mjs` / `video-stop.mjs` capture the actual canvas/audio; `drive.mjs` supplies
the first-shift hand input, and `shoot-details.mjs` records receipt/settings interaction. The captured first-shift
run passes 27/27 checks. Automation waits were cut; retained footage plays at normal speed.

The three original `.webm` files and input results are in `docs/revision1/video/`. Rebuild the edit with
`python3 docs/revision1/video/edit.py` using Pillow and ffmpeg. Fonts come from the app's licensed local assets.
The video has no narration or music; app cues and editorial captions explain the workflow. Human listening and
an unfamiliar-user first shift remain explicit [owner/device checks](docs/revision1/human-checks.md).
