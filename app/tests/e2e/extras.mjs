#!/usr/bin/env node
// Emulator e2e, part 2 (hands only): escalate pad, one-handed hold, eyes-only
// gaze-pinch veto, push-veto of a drill, seal pickup replay, settings puck,
// pause on exit, then shift handover with trust rule drop and auto-seal.
// Usage: node tests/e2e/extras.mjs [--shots]
import { writeFileSync } from 'node:fs';
import { Driver } from './driver.mjs';

const d = new Driver(process.argv.includes('--shots'));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const held = (s, tool) => s.tokens.find((t) => t.tool === tool && t.status === 'held' && (t.place === 'tray' || t.place === 'slot'));
const inspect = (tool) => {
  const first = held(d.waitFor(tool, (x) => held(x, tool)), tool);
  d.sleep(1500); // let it finish dropping into the tray
  const tok = d.probe().tokens.find((t) => t.id === first.id);
  d.look(tok.at);
  d.waitFor(`inspect ${tool}`, (x) => x.focus === tok.id);
  d.sleep(600);
  return d.probe().tokens.find((t) => t.id === tok.id);
};
const start = (search) => {
  d.cli(['browser', 'run', 'tests/e2e/reset.mjs']);
  d.page(`location.search = ${JSON.stringify(search)}`);
  d.sleep(5000);
  d.cli(['xr', 'enter']);
  d.cli(['xr', 'set-input-mode'], { mode: 'hand' });
  d.sleep(1500);
  d.calibrate();
  const s = d.waitFor('anchor', (x) => x.ready && x.anchor !== 'pending');
  d.rightRest = [s.head[0] + 0.25, s.head[1] - 0.3, s.head[2] - 0.1];
  d.leftRest = [s.head[0] - 0.25, s.head[1] - 0.3, s.head[2] - 0.1];
  d.park();
  return s;
};

// ---- first shift, alternative gestures ----
start('?mode=onboarding');
let tok = inspect('set_conveyor_speed');
let s = d.probe();
d.carry(tok.at, s.pad, 'hand-right', tok.id);
s = d.waitFor('escalated', (x) => x.ledger.length >= 1, 10);
check('escalate pad → ESCALATE, token parks in rack (C09)', s.ledger[0].decision === 'ESCALATE' && s.tokens.find((t) => t.id === tok.id)?.place === 'rack');

// one-handed: settings puck opens by poke (C31), then one palm + gaze on the seal (C26)
s = d.probe();
d.move('hand-right', [s.puck[0], s.puck[1] + 0.01, s.puck[2]], 0.6);
d.pinch('hand-right', 1);
d.pinch('hand-right', 0);
s = d.waitFor('settings open', (x) => x.settingsOpen, 6);
check('pinch the settings puck → panel opens (C31)', s.settingsOpen);
d.shot('extras-settings');
d.pinch('hand-right', 1);
d.pinch('hand-right', 0);
s = d.waitFor('settings closed', (x) => !x.settingsOpen, 6);
d.park();
d.page(`window.cyclone.app.settings.set('oneHanded', true)`);
tok = inspect('set_arm_velocity');
s = d.probe();
d.carry(tok.at, s.slot, 'hand-right', tok.id);
s = d.waitFor('arm in slot', (x) => x.tokens.some((t) => t.id === tok.id && t.place === 'slot'), 10);
const at = s.tokens.find((t) => t.id === tok.id).at;
d.look([s.slot[0], s.slot[1] + 0.01, s.slot[2]]);
d.move('hand-right', [at[0] + 0.02, at[1] + 0.01, at[2]]);
s = d.waitFor('one-hand sealed', (x) => x.ledger.length >= 2, 10);
d.park();
check('one hand + gaze on the seal 1.5 s → APPROVE (C26)', s.ledger[1].gesture === 'one_hand_gaze_hold', s.ledger[1].gesture);
d.page(`window.cyclone.app.settings.set('oneHanded', false)`);

// eyes-only: dwell on the oven token, then look at the chute and pinch (C25)
d.page(`window.cyclone.app.settings.set('eyesOnly', true)`);
tok = inspect('set_oven_setpoint');
s = d.probe();
d.sleep(800); // ray targets re-sync at 2 Hz
// hand raised clear of every near target (near pointers outrank the ray), aimed at the chute, pinch held briefly
d.cli(['xr', 'animate-to'], { device: 'hand-right', position: { x: s.head[0] + 0.2, y: s.head[1] - 0.15, z: s.head[2] - 0.15 }, duration: 0.4 });
d.sleep(700);
d.cli(['xr', 'look-at'], { device: 'hand-right', target: { x: s.chute[0], y: s.chute[1], z: s.chute[2] } });
d.sleep(400);
d.pinch('hand-right', 1);
d.sleep(200);
d.pinch('hand-right', 0);
s = d.waitFor('oven vetoed by pinch', (x) => x.ledger.length >= 3, 10);
check('eyes-only: pinch on the chute vetoes the inspected token (C25)', s.ledger[2].decision === 'REJECT' && s.ledger[2].gesture === 'gaze_pinch', s.ledger[2].gesture);
d.page(`window.cyclone.app.settings.set('eyesOnly', false)`);
d.park();

// drill: shove it off the desk edge with an open hand → caught (C07 push, C16)
tok = inspect('lift_pallet');
s = d.probe();
const edge = [s.offEdge[0] - tok.at[0], s.offEdge[2] - tok.at[2]];
const n = Math.hypot(edge[0], edge[1]);
const ux = edge[0] / n;
const uz = edge[1] / n;
d.move('hand-right', [tok.at[0] - ux * 0.03, tok.at[1] + 0.06, tok.at[2] - uz * 0.03], 0.4);
d.move('hand-right', [tok.at[0] - ux * 0.03, tok.at[1], tok.at[2] - uz * 0.03], 0.3);
for (let k = 1; k <= 12; k++) d.move('hand-right', [tok.at[0] + ux * (k * 0.04 - 0.03), tok.at[1], tok.at[2] + uz * (k * 0.04 - 0.03)], 0.25);
s = d.waitFor('drill pushed off', (x) => x.ledger.length >= 4, 10);
d.park();
check('push a resting token off the edge → veto (C07)', s.ledger[3].decision === 'REJECT' && s.ledger[3].gesture === 'veto_push');
check('drill caught → calibration 100% (C16)', s.calibration.startsWith('100%'), s.calibration);
d.shot('extras-drill-caught');

// seal pickup replays its rehearsal (C11)
s = d.probe();
const seal = s.seals[s.seals.length - 1];
d.carry(seal, [seal[0] + 0.05, seal[1] + 0.08, seal[2] + 0.05]);
s = d.waitFor('replay', (x) => x.replay !== null, 6);
check('pick up a seal → its rehearsal replays (C11)', !!s.replay, s.replay);

// pause: leaving XR freezes the session clock (C29)
d.cli(['xr', 'exit']);
d.sleep(1000);
const t0 = d.probe().t;
d.sleep(3000);
s = d.probe();
check('session hidden → clock frozen (C29)', s.paused && Math.abs(s.t - t0) < 0.05, `t ${t0.toFixed(2)} → ${s.t.toFixed(2)} over 3 s`);

// ---- handover: trust ring fills, rule offered, dropped on the agent, auto-seal (C15, C17) ----
start('?mode=handover');
s = d.waitFor('handover queue', (x) => x.tokens.filter((t) => t.status === 'held').length >= 3, 20);
check('handover: overnight queue loads, first token ≤ 15 s (C15)', s.t <= 15, `${s.tokens.length} held at ${s.t.toFixed(1)} s`);
// three clean approvals by the line agent, eyes-only (look at the token, then look-and-pinch the slot)
d.page(`window.cyclone.app.settings.set('eyesOnly', true)`);
for (const tool of ['set_conveyor_speed', 'set_conveyor_speed', 'lift_pallet']) {
  tok = inspect(tool);
  s = d.probe();
  const before = s.ledger.length;
  d.cli(['xr', 'animate-to'], { device: 'hand-right', position: { x: s.head[0] + 0.2, y: s.head[1] - 0.15, z: s.head[2] - 0.15 }, duration: 0.3 });
  d.sleep(900);
  d.cli(['xr', 'look-at'], { device: 'hand-right', target: { x: s.slot[0], y: s.slot[1], z: s.slot[2] } });
  d.sleep(400);
  d.pinch('hand-right', 1);
  d.sleep(200);
  d.pinch('hand-right', 0);
  d.waitFor(`${tool} sealed`, (x) => x.ledger.length > before, 15);
}
d.page(`window.cyclone.app.settings.set('eyesOnly', false)`);
d.park();
s = d.waitFor('rule offered', (x) => x.rules.length > 0, 10);
check('ring full → rule offered (C17)', s.trust['line-agent'] === 1 && s.rules.length === 1);
d.shot('extras-rule');
const line = s.agents.find((a) => a.id === 'line-agent');
d.carry(s.rules[0], line.at);
s = d.waitFor('auto-sealed', (x) => x.ledger.some((r) => r.decision === 'AUTO_APPROVE_RULE'), 25);
check('drop rule on agent → matching intent auto-executes and auto-seals (C17)', true, s.ledger.map((r) => r.decision).join(','));

writeFileSync('../docs/e2e-extras.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
