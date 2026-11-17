# Video — revision 3 (external Chrome recapture)

The current `app/public/video/cyclone-revision3.mp4` was re-recorded on 17 November in **external Google Chrome with the installed Quest emulator extension**, from the unchanged `f9f40c7` app build. Both source canvases render at native **3840×2160**. The existing design, edit sequence, captions and shot durations are preserved; the final close-ups are downsampled instead of enlarged.

**Current output:** 119.985333 s · 1920×1080 · 30 fps · H.264/AAC · 9,257,098 bytes · SHA-256 `6fbefc91387c6d2ddf8e015e0d128a774d0c8d61d102d1d5c5f293a703c3bd29`.

See [the external Chrome capture notes](chrome/README.md), [current edit manifest](chrome/edit.json), [verification](chrome/qa.json), and [contact sheet](chrome/contact-sheet.jpg). Rebuild the current file with `python3 docs/revision3/video/chrome/edit.py`. The three new takes passed **28 capture checks**. The edit is [public on YouTube](https://youtu.be/bEx3UlCG-IE), verified at 1080p, and embedded in the updated Devpost submission.

## Earlier 1080p take (superseded)

The first revision-3 take, recorded in the headed IWSDK browser at 1920×1080, was replaced by the external
Chrome recapture above. Its raw takes and manifest were removed from the tree during the 17 November cleanup
(D65) and remain in git history at `beec898`. `edit.py` in this folder stays because `chrome/edit.py` imports its
segment list, graphics and encoder.
