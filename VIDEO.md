# Video — shot list and capture mode (C47)

Under 2:55, real headset capture (H4), captions on, no logos or wordmarks on screen.

## Capture mode

| URL | What it does |
|---|---|
| `?capture=1` | Deterministic first shift for recording: fixed seed and clock epoch (same intents, hashes and glyphs every take), timestamps quantised to whole seconds, no random drills, captions on, its own storage namespace cleared at start. |
| `?capture=endcard` | Calm-eye end card: reads the seals recorded by the last `?capture=1` session and lines them up on the ledger shelf; no scenario runs, the tray stays empty, machines idle, HUD and captions hidden, ambient hum only. Overlay the tagline in editing. |

Verified in the emulator by `app/tests/e2e/capture.mjs` (same first intent hash across two takes; end card shows the
session's 4 seals with 0 tokens). Record in passthrough at a real desk; do one take with passthrough off (settings
puck) for the plinth/VR contrast.

## Shot list (BRIEF §14)

| Time | Shot | Beat in capture mode |
|---|---|---|
| 0:00–0:08 | Passthrough: a real desk. The micro-factory blooms on it. A token drops with a tone. Caption: "Your AI agent wants to speed up a robot arm." | Enter → bloom (t=0), first token at 6 s |
| 0:08–0:20 | Flash a 2D JSON approval prompt. Caption: "Would you approve this?" Cut back to the desk. | Edit insert (no logos) |
| 0:20–1:10 | Hero loop: look → card unfolds; scrub → breach flares at the walkway; twist 250 → 180 → breach clears; two-hand hold; seal stamps with the matching glyph. | Token 2 (arm) after token 1 is placed |
| 1:10–1:30 | Oven 450 °C: execute slot locks; push the token off the real desk edge. | Token 3 |
| 1:30–1:55 | Drill: approve a routine pallet lift → "Drill — you missed it" → ghost replay → calibration score, trust ring fills. | Token 4 |
| 1:55–2:20 | Under the hood: split screen — agent terminal issues a tool call → held → token appears in headset → decision → signed record verifies. No logos on screen. | Live mode: `agent/` + `relay/` (needs H1) |
| 2:20–2:36 | Glasses-ready: gaze + pinch, FoV crop, eyes-only mode. | Settings puck → eyes-only |
| 2:36–2:44 | The last token settles: seal lands on the shelf, machines slow to idle, the hum fades. Caption: "Approve the outcome, not the payload." | Shift summary |
| 2:44–2:55 | Calm-eye end card: still tabletop, empty tray, seals lined up on the shelf. Tagline: "Cyclone — the calm eye where humans decide what AI agents do." Then title + link. | `?capture=endcard` |
