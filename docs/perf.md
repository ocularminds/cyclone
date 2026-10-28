# Performance log (C40)

Budget: ≤ 60k triangles, instanced/shared geometry, baked-style lighting, one transparent ghost pass,
72 fps target on Quest 3/3S (60 minimum).

| Date | Where | Measure | Result |
|---|---|---|---|
| 2026-10-28 | IWSDK emulator (Quest 3 profile, desktop Chromium) | frame rate in XR session | 60 fps (desktop vsync cap) |
| 2026-10-28 | emulator, first shift with 4 tokens in the tray | `renderer.info.render.triangles` | 29,944 rendered triangles / frame (scene meshes: 15,252) — within budget |
| 2026-10-28 | same | draw calls | 226 — high for mobile; candidates to merge: tray wells, shelf tiers, dial ribs, agent pedestals |
| — | Quest 3/3S device | fps, FoV crop, two rooms | ⛔ H3 — needs a device session (`iwsdk-native-xr-test`) |

Lighting: one hemisphere + one directional + ambient, no shadows; matte Lambert materials. Transparent passes: the
ghost (one shared material), labels and markings. All sound is synthesised (no audio decode cost).
