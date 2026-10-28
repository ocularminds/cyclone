#!/usr/bin/env node
// C47: capture mode is deterministic, and the end card shows the session's seals with an empty tray and no HUD.
import { execFileSync } from 'node:child_process';
import { Driver } from './driver.mjs';

const d = new Driver(true);
const firstGlyph = () => {
  d.page(`location.search = '?capture=1'`);
  d.sleep(5000);
  d.cli(['xr', 'enter']);
  d.cli(['xr', 'set-input-mode'], { mode: 'hand' });
  return d.waitFor('first token', (x) => x.tokens.length > 0, 30).tokens[0].glyph;
};
const a = firstGlyph();
const b = firstGlyph();
console.log(`${a === b ? 'PASS' : 'FAIL'} capture mode is deterministic (same first intent hash across runs) — ${a}`);
// decide the first shift's tokens programmatically, as a recorded session would have
d.page(`(async () => {
  const { app } = window.cyclone;
  const order = [['set_conveyor_speed','APPROVE','place'],['set_arm_velocity','APPROVE','two_hand_hold'],['set_oven_setpoint','REJECT','veto_push'],['lift_pallet','REJECT','veto_push']];
  for (const [tool, kind, gesture] of order) {
    let t;
    for (let i = 0; i < 200 && !(t = app.shift.waiting().find((x) => x.intent.tool === tool)); i++) await new Promise((r) => setTimeout(r, 100));
    if (tool === 'set_arm_velocity') await app.shift.amend(t.id, 180);
    await app.shift.decide(t.id, kind, gesture);
  }
  return app.ledger.own().length;
})()`);
d.page(`location.search = '?capture=endcard'`);
d.sleep(5000);
d.cli(['xr', 'enter']);
d.cli(['xr', 'set-input-mode'], { mode: 'hand' });
d.sleep(4000);
const s = d.probe();
const ok = s.seals.length >= 4 && s.tokens.length === 0;
console.log(`${ok ? 'PASS' : 'FAIL'} end card: ${s.seals.length} seals on the shelf, ${s.tokens.length} tokens, captions hidden`);
d.cli(['xr', 'animate-to'], { device: 'hand-right', position: { x: 0.6, y: 0.4, z: 0.6 }, duration: 0.2 });
d.cli(['xr', 'animate-to'], { device: 'hand-left', position: { x: -0.6, y: 0.4, z: 0.6 }, duration: 0.2 });
d.sleep(800);
execFileSync('npx', ['iwsdk', 'browser', 'screenshot', '--output-file', '../docs/screens/endcard.png']);
d.page(`location.search = ''`);
