#!/usr/bin/env node
// Emulator smoke: a judge entering with Touch controllers in hand is told to put them down.
// Hands are the required path (brief §1); squeeze does not carry tokens (DECISIONS D62).
// Needs `iwsdk dev up --allow-browser-automation`. Usage: node tests/e2e/controllers.mjs
import { Driver } from './driver.mjs';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const d = new Driver(false);
const held = (s, tool) => s.tokens.find((t) => t.tool === tool && t.status === 'held' && t.place === 'tray');
const squeeze = (device, value) => {
  d.cli(['xr', 'set-gamepad-state'], { device, buttons: [{ index: 1, value }] });
  d.sleep(250);
};

d.cli(['browser', 'run', 'tests/e2e/reset.mjs']);
d.page(`location.search = '?mode=onboarding'`);
d.sleep(5000);
d.page(`(()=>{window.__toasts=[];window.cyclone.app.bus.on('toast',t=>window.__toasts.push(t.text));return true})()`);
d.cli(['xr', 'enter']);
d.cli(['xr', 'set-input-mode'], { mode: 'controller' });
d.sleep(1500);
// grip offset per controller (same probe as the hand driver)
d.offset = {};
for (const [device, side, p] of [['controller-left', 'left', [-0.1, 1.3, -0.3]], ['controller-right', 'right', [0.1, 1.3, -0.3]]]) {
  d.cli(['xr', 'animate-to'], { device, position: { x: p[0], y: p[1], z: p[2] }, duration: 0.2 });
  d.sleep(500);
  const g = d.cli(['browser', 'run', 'tests/e2e/grip.mjs'])[side];
  d.offset[device] = [g[0] - p[0], g[1] - p[1], g[2] - p[2]];
}
let s = d.waitFor('anchor', (x) => x.ready && x.anchor !== 'pending');
const rest = { 'controller-right': [s.head[0] + 0.25, s.head[1] - 0.3, s.head[2] - 0.1], 'controller-left': [s.head[0] - 0.25, s.head[1] - 0.3, s.head[2] - 0.1] };
const park = () => { for (const [dev, p] of Object.entries(rest)) d.move(dev, p, 0.3); };
park();

// Controllers are not a carry path (squeeze does not grab tokens): the user must be told to use hands.
d.sleep(1500);
const toasts = JSON.stringify(d.page(`JSON.stringify(window.__toasts)`));
check('controllers in hand → "put the controllers down" hint shown', toasts.includes('Put the controllers down'), toasts.slice(0, 200));

d.cli(['xr', 'set-input-mode'], { mode: 'hand' });
console.log(`${results.filter((r) => r.ok).length}/${results.length} controller checks passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
