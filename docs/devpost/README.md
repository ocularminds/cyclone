# Cyclone — Devpost artifacts

Prepared 10 November 2026 for [Meta VR Start Developer Competition 2026](https://start-developer-competition-26.devpost.com/).
Track: **Productivity**. Division: **New**. Build path: **IWSDK (Web XR)**.

[Open the demo](https://ocularminds.github.io/cyclone/) · [Watch the 2:49 video](https://youtu.be/NaKl8JTSMP4) ·
[Source and evidence](https://github.com/ocularminds/cyclone) ·
[Devpost project](https://devpost.com/software/cyclone-the-calm-eye-for-ai-agents-decisions)

## Artwork and gallery

All six upload images are **1800 × 1200 PNG (3:2), below 5 MB**. `cover.png` is the project thumbnail and first
gallery image. It preserves the approved Cyclone logo, original Three.js concept illustration and exact
“Rehearse. Reshape. Decide.” typography. It is explicitly labelled concept artwork. The other five images are
cropped frames from the real, hand-driven IWSDK emulator takes used in the public video. Cropping removes
surrounding black canvas; it does not redraw, replace or rearrange any application interface.

| File | Subject | Source |
|---|---|---|
| `cover.png` | Cover artwork | `design/brand1/assets/cover-1920x1080.png` |
| `inspect.png` | Held conveyor action | `workflow.webm`, 15 s |
| `amend.png` | Arm, 250°/s → 180°/s | `workflow.webm`, 75 s |
| `locked.png` | Forbidden oven request | `workflow.webm`, 140 s |
| `receipt.png` | Demo receipt and retained evidence | `details.webm`, 30 s |
| `access.png` | Desk settings, 125% text | `details.webm`, 78 s |

`manifest.json` records source hashes, timestamps, crop rectangles, export sizes and hashes. `contact.jpg` is the
review sheet. `story.md` and `fields.json` preserve the public story and technical submission answers; private
account fields are excluded. The target public beta is explicitly tentative, Q1 2027.

Reproduce images with `python3 docs/devpost/export.py` (Pillow and ffmpeg). Regenerate copy with
`python3 docs/devpost/copy.py`. `export.py` retains the unmodified extracted frames under `frames/`.
The editable concept scene, vector logos, local fonts and licence notices live in `design/brand1/`.

## Demo proof

The pack includes the actual exported `demo-dossier.json` and public `demo-jwks.json`. There is no private key.
They use proof-bundle 2.0 and pass `@decionis/verify` 0.5.0:

```sh
npx @decionis/verify --file proof/demo-dossier.json --jwks proof/demo-jwks.json --json
```

Signature validity and required artifact coverage pass. The trust anchor remains **UNESTABLISHED**: this is a
local demo signature, not an official issuer identity or authority to operate a machine. The public CLI does
not establish a live execution binding or observed physical outcome for this demo proof.

## Evidence boundaries

The full default demo runs without a login, backend or live policy service. All execution is simulated; ghost
motion is a rehearsal from a kinematic model. 81 app and 70 relay unit tests passed in revision 1; emulator
evidence is versioned under `docs/revision1/`. Full Intent CLI conformance remains 15/16, with the retained
`policy-projection.json` compatibility failure; browser/reference parity is a separate passing check.
Physical Quest performance/room/FoV checks, genuine provisioned live-service acceptance and human listening/
usability review remain open. No gallery image or signature export claims these checks have passed.

## Publication status

The artwork and technical copy are saved to the existing Devpost project. This packet documents the creative
assets and demo evidence, not competition eligibility. The separate
[submission status record](https://github.com/ocularminds/cyclone/blob/main/docs/devpost/status.json)
contains the last browser-verified save/submission state.
