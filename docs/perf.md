# Performance log (C40)

Budget: ≤ 60k triangles, instanced/shared geometry, baked-style lighting, one transparent ghost pass,
72 fps target on Quest 3/3S (60 minimum).

| Date | Where | Measure | Result |
|---|---|---|---|
| 2026-10-28 | IWSDK emulator (Quest 3 profile, desktop Chromium) | frame rate in XR session | 60 fps (desktop vsync cap) |
| 2026-10-28 | emulator, first shift with 4 tokens in the tray | `renderer.info.render.triangles` | 29,944 rendered triangles / frame (scene meshes: 15,252) — within budget |
| 2026-10-28 | same | draw calls | 226 — high for mobile; candidates to merge: tray wells, shelf tiers, dial ribs, agent pedestals |
| 2026-11-10 | Final design1 after reading-layer correction, IWSDK IWER / desktop Chromium, active XR; arm comparison, 125% text, rule offer, 3 held tokens and 3 receipts | 480 frames over 8.01 s | 60.01 fps average; median 16.6 ms, p95 18.5 ms. Desktop vsync evidence only. |
| 2026-11-10 | same | rendered geometry and calls | 30,312 triangles maximum (below 60k); 278 draw calls maximum; one active transparent rehearsal ghost. |
| — | Quest 3/3S device | fps, FoV crop, two rooms | ⛔ H3 — needs a device session (`iwsdk-native-xr-test`) |

Lighting: one hemisphere + one directional + ambient, no shadows; matte Lambert materials. Transparent passes: the
ghost (one shared material), labels and markings. All sound is synthesised (no audio decode cost).

Design1 uses opaque unlit reading surfaces, local TTFs and the existing renderer. It adds no cover scene,
runtime shadows or second ghost. The main production JavaScript chunk is about 7.94 MB (2.07 MB gzip),
including the existing SDK/emulator graph. Draw calls remain a mobile profiling concern; the desktop result
does not prove the required 60 fps minimum or 72 fps target on Quest.

The [final raw sample](design1/performance.json) records the emulated user agent (spoofed by IWER), frame statistics,
triangles, draw calls and scene state. [Build identifiers](design1/build.json) and [device availability](design1/device.json)
are separate. No physical Quest was connected; sustained/thermal measurements and the FoV crop remain H3.
The earlier busy-scene sample is retained in `design1/performance-before-depth-fix.json` (30,336 triangles,
280 calls); both samples stay below the geometry budget.
