#!/usr/bin/env node
// Renders all four risk levels side by side for the C23 greyscale check and the C27 high-contrast check.
import { execFileSync } from 'node:child_process';
import { Driver } from './driver.mjs';

const d = new Driver(true);
d.cli(['browser', 'run', 'tests/e2e/reset.mjs']);
d.page(`location.search = '?mode=onboarding'`);
d.sleep(5000);
d.cli(['xr', 'enter']);
d.cli(['xr', 'set-input-mode'], { mode: 'hand' });
d.sleep(2500);
d.page(`(async () => {
  const { app } = window.cyclone;
  for (const key of ['drill-arm-200', 'arm', 'oven']) {
    await app.shift.receive(await app.engine.factory.build(app.engine.template(key)));
  }
  return true;
})()`);
d.sleep(2500);
const s = d.probe();
const xs = s.tokens.map((t) => t.at);
const c = xs.reduce((a, p) => [a[0] + p[0] / xs.length, a[1] + p[1] / xs.length, a[2] + p[2] / xs.length], [0, 0, 0]);
d.cli(['xr', 'animate-to'], { device: 'hand-right', position: { x: 0.5, y: 0.5, z: 0.5 }, duration: 0.2 });
d.cli(['xr', 'animate-to'], { device: 'hand-left', position: { x: -0.5, y: 0.5, z: 0.5 }, duration: 0.2 });
d.cli(['xr', 'set-transform'], { device: 'headset', position: { x: c[0], y: c[1] + 0.2, z: c[2] + 0.12 } });
d.cli(['xr', 'look-at'], { device: 'headset', target: { x: c[0], y: c[1], z: c[2] }, moveToDistance: 0.24 });
d.sleep(1500);
execFileSync('npx', ['iwsdk', 'browser', 'screenshot', '--output-file', '../docs/screens/risk-normal.png']);
d.page(`window.cyclone.app.settings.set('highContrast', true)`);
d.sleep(1000);
execFileSync('npx', ['iwsdk', 'browser', 'screenshot', '--output-file', '../docs/screens/risk-contrast.png']);
d.page(`window.cyclone.app.settings.set('highContrast', false)`);
console.log('levels', s.tokens.map((t) => t.tool).join(', '));
