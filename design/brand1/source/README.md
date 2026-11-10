# Editable cover artwork

`scene.js` is the original 3D scene used for the Cyclone cover. It contains editable geometry, materials, lighting, camera and framing. The source uses Three.js 0.181.0; its bundled modules and MIT licence are in `vendor/`.

Serve this directory with a local HTTP server, then open `index.html`. The scene renders at 1920 × 1080. ES modules require HTTP; the finished design studio one directory above works directly as a local file.

For a developer, an example preview command from this directory is `python3 -m http.server 8080 --bind 127.0.0.1`, then open `http://127.0.0.1:8080/`. Use the “Save artwork” button to export the text-free render. Change the source and reload to make a new render.

The finished cover combines that render with the outlined Cyclone lockup and typeset Manrope/Atkinson text. Keep the phrase “Rehearse. Reshape. Decide.” and the small concept-artwork label on this composition. The text-free export can be used for other layouts.

Materials in the illustration are shaded by the scene lighting. UI colours should come from `tokens.json`, not sampled pixels from a lit render. This artwork is a concept illustration and is not evidence of application behaviour.
