# Video — shot list and capture mode (C47)

Under 2:55, real headset capture (H4), captions on, no third-party logos or wordmarks on screen.

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
| 0:00–0:08 | Passthrough: a real desk. The micro-factory blooms on it. A token drops with a tone. Caption: "Your AI agent wants to speed up a conveyor." | Enter → bloom (t=0), first token at 6 s |
| 0:08–0:20 | Flash a 2D JSON approval prompt. Caption: "Would you approve this?" Cut back to the desk. | Edit insert (no logos) |
| 0:20–1:10 | Hero loop: look → card unfolds; scrub → breach flares at the walkway; twist 250 → 180 → breach clears; Compare shows dashed original and solid proposed; two-hand hold; seal stamps with the matching glyph. | Token 2 (arm) after token 1 is placed |
| 1:10–1:30 | Oven 450 °C: execute slot locks; push the token off the real desk edge. | Token 3 |
| 1:30–1:55 | Drill: approve a routine-looking pallet lift → "Drill — you missed it" → stored clip replay → calibration score. A drill does not earn trust. | Token 4 |
| 1:55–2:20 | Under the hood: held action → decision receipt → retained model and proof scope. Show **Demo signature** for local records. Use the live agent/relay split screen only after matching live proof checks pass. | Demo receipt available; live shot requires H1 and technical R1 binding verification |
| 2:20–2:36 | Access controls: Gaze + pinch, preferred hand, larger text. Use an actual Quest narrow-FoV crop only after H3 validation; label emulator footage as such. | Settings puck → Input / Display |
| 2:36–2:44 | The last token settles: seal lands on the shelf, machines slow to idle, the hum fades. Caption: "Approve the outcome, not the payload." | Shift summary |
| 2:44–2:55 | Calm-eye end card: still tabletop, empty tray, seals lined up on the shelf. Tagline: "Cyclone — the calm eye where humans decide what AI agents do." Then title + link. | `?capture=endcard` |

The opening copy names the actual first scenario; the arm is the second token and the hero shot. A local demo
signature is not an official live attestation, and an authorization is not a physical execution receipt. The
comparison and ledger shots use the application's actual model evidence. H3/H4 remain open until hardware
validation and real headset recording are available.
