# External Chrome capture — 17 November 2026

This take replaces the footage in `app/public/video/cyclone-revision3.mp4` while retaining the revision-3 design, caption wording, sequence, durations, crop framing and real-time playback.

The source is the installed **Immersive Web Emulator 2.0.0** Chrome extension, emulating **Meta Quest 3** with **IWER 2.3.0**. The app is the unmodified production build of `f9f40c7`, served locally in regular Google Chrome. Both the application canvas and the extension's synthetic-room canvas render at **3840×2160**. Their actual pixels and the app's WebAudio mix are recorded. The final 1920×1080 edit downsamples its crops; it never enlarges a source crop.

No scene, material, font, layout, application system or asset was edited. The only hidden elements during a take are the extension's controls and transform gizmos. Its room is synthetic; execution is simulated and signatures are demo signatures. This is not physical-headset footage.

## Files

- `workflow.webm` / `workflow.json`: full hands-only workflow, cue timestamps, edit marks and 17 passed interaction checks.
- `endcard.webm` / `endcard.json`: the four seals from that actual workflow; empty tray, idle machines, no app HUD or captions.
- `details.webm` / `details.json`: physical seal pickup, actual receipt proof and settings controls.
- `edit.py` / `edit.json`: rebuild script, source hashes, exact cuts, capture checks and output metadata.
- `cyclone-revision3.srt` / `transcript.txt`: the retained editorial captions. There is no narration or added music.
- `contact-sheet.jpg`: overview of the finished edit.
- `quality.png` / `preflight.json`: native-resolution preflight and recording dimensions.

## Reproduce

1. Run `cd app && npm run typecheck && npm run build`.
2. Run `node tests/e2e/chrome-capture-server.mjs`. This serves `dist/` and accepts the recording files on loopback only.
3. Open `http://cyclone.localhost:8082/?mode=onboarding&capture=1&reset=1` in **external Chrome**, with the installed Immersive Web Emulator enabled for that site. This hostname deliberately falls outside the bundled emulator's activation pattern, so the installed extension owns WebXR.
4. Set the Chrome capture viewport to **3840×2160 CSS pixels, device scale factor 1** before entering XR. A 2× device scale factor by itself does not increase this extension's XR application framebuffer. The recording script refuses any app canvas that is not genuinely 3840×2160.
5. Enter XR, then import `/__capture/chrome-capture.mjs`, call its `install()`, and start `window.cycloneTake.start('workflow')`. The director uses the extension's documented `remote.dispatch()` head/hand commands and the existing application's real gesture handling. Monitor `window.cycloneTake.status`; continue only after `complete`.
6. Navigate to `?capture=endcard`, enter XR, install the director again and run `start('endcard')`. Do this before the details take so the end card uses the four workflow seals.
7. Navigate to `?capture=1`, enter XR, install the director again and run `start('details')`.
8. From the repository root, run `python3 docs/revision3/video/chrome/edit.py`. It uses the existing revision-3 graphic renderer and retimes cuts against the newly recorded event marks.
9. Inspect the output and contact sheet; reset the temporary Chrome viewport override.

The delivered edit was [published publicly on YouTube](https://youtu.be/bEx3UlCG-IE) on 17 November 2026
and added to the existing Devpost submission. The watch page was verified playing at 1920×1080 with no media error.
[Publication metadata](youtube.json), [confirmation](youtube-published.jpg), and [HD playback](youtube-1080p.jpg)
record the upload. The capture/rebuild scripts themselves perform no upload.
