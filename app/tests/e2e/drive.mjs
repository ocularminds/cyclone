#!/usr/bin/env node
// Emulator e2e: plays the whole first shift hands-only (controllers never used)
// through the IWSDK CLI, asserting each beat. Needs `iwsdk dev up --allow-browser-automation`.
// Usage: node tests/e2e/drive.mjs [--shots]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SHOTS = process.argv.includes('--shots');
const results = [];

class Driver {
  cli(args, input) {
    const argv = ['iwsdk', ...args];
    if (input) argv.push('--input-json', JSON.stringify(input));
    const out = execFileSync('npx', argv, { encoding: 'utf8', timeout: 120000 });
    const json = JSON.parse(out);
    if (!json.ok) throw new Error(`${args.join(' ')} failed: ${JSON.stringify(json.error)}`);
    return json.data?.result ?? json.data;
  }
  probe() {
    return this.cli(['browser', 'run', 'tests/e2e/probe.mjs']);
  }
  sleep(ms) {
    execFileSync('sleep', [String(ms / 1000)]);
  }
  waitFor(label, pred, timeoutS = 40) {
    const t0 = Date.now();
    for (;;) {
      const s = this.probe();
      if (pred(s)) return s;
      if (Date.now() - t0 > timeoutS * 1000) throw new Error(`timeout waiting for ${label}`);
      this.sleep(500);
    }
  }
  /** Grip offset from the emulated hand origin, per hand (a palm-down reach). */
  calibrate() {
    this.offset = {};
    for (const [device, side, p] of [['hand-left', 'left', [-0.1, 1.3, -0.3]], ['hand-right', 'right', [0.1, 1.3, -0.3]]]) {
      this.cli(['xr', 'animate-to'], { device, position: { x: p[0], y: p[1], z: p[2] }, orientation: { pitch: -70, yaw: 0, roll: 0 }, duration: 0.2 });
      this.sleep(500);
      const g = this.cli(['browser', 'run', 'tests/e2e/grip.mjs'])[side];
      this.offset[device] = [g[0] - p[0], g[1] - p[1], g[2] - p[2]];
    }
  }
  /** Move a hand so its grip (palm) arrives at `p`. */
  move(device, p, duration = 0.4) {
    const o = this.offset?.[device] ?? [0, 0, 0];
    const orientation = device.startsWith('hand') ? { pitch: -70, yaw: 0, roll: 0 } : undefined;
    this.cli(['xr', 'animate-to'], { device, position: { x: p[0] - o[0], y: p[1] - o[1], z: p[2] - o[2] }, orientation, duration });
    this.sleep(duration * 1000 + 250);
  }
  pinch(device, value) {
    this.cli(['xr', 'set-select-value'], { device, value });
    this.sleep(250);
  }
  look(p) {
    this.cli(['xr', 'look-at'], { device: 'headset', target: { x: p[0], y: p[1], z: p[2] } });
    this.sleep(600);
  }
  shot(name) {
    if (SHOTS) execFileSync('npx', ['iwsdk', 'browser', 'screenshot', '--output-file', `../docs/screens/${name}.png`]);
  }
  /** Pinch-grab the thing at `from`, carry it slowly so it lands on `to`, release. (The emulator reports a lagging mid-grab pose; the release pose is exact.) */
  carry(from, to, hand = 'hand-right', id = null) {
    const start = [from[0], from[1] + 0.01, from[2]];
    this.move(hand, start);
    this.pinch(hand, 1);
    let h = [start[0] + to[0] - from[0], start[1] + to[1] - from[1], start[2] + to[2] - from[2]];
    this.move(hand, h, 1.5);
    this.pinch(hand, 0);
    this.move(hand, [h[0] + 0.15, h[1] + 0.2, h[2] + 0.15]);
  }
  /** Both palms onto a point in one atomic device update (quaternion for pitch -70°). */
  palms(at) {
    const q = { x: Math.sin((-70 * Math.PI) / 360), y: 0, z: 0, w: Math.cos((-70 * Math.PI) / 360) };
    const pos = (device, dx) => {
      const o = this.offset[device];
      return { x: at[0] + dx - o[0], y: at[1] + 0.01 - o[1], z: at[2] - o[2] };
    };
    this.cli(['xr', 'set-device-state'], {
      state: { hands: { left: { position: pos('hand-left', -0.03), orientation: q }, right: { position: pos('hand-right', 0.03), orientation: q } } },
    });
  }
  /** Lift one hand clear instantly (no animation). */
  lift(device, p) {
    const o = this.offset[device];
    this.cli(['xr', 'set-transform'], { device, position: { x: p[0] - o[0], y: p[1] - o[1], z: p[2] - o[2] } });
  }
  park() {
    this.move('hand-left', this.leftRest);
    this.move('hand-right', this.rightRest);
  }
}

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const d = new Driver();
const held = (s, tool) => s.tokens.find((t) => t.tool === tool && t.status === 'held' && (t.place === 'tray' || t.place === 'slot'));

// fresh first-visit state, then into XR with hands only
d.cli(['browser', 'run', 'tests/e2e/reset.mjs']);
d.cli(['browser', 'reload']);
d.sleep(4000);
d.cli(['xr', 'enter']);
d.cli(['xr', 'set-input-mode'], { mode: 'hand' });
d.sleep(1500);
d.calibrate();
let s = d.waitFor('anchor', (x) => x.ready && x.anchor !== 'pending');
d.rightRest = [s.head[0] + 0.25, s.head[1] - 0.45, s.head[2] - 0.1];
d.leftRest = [s.head[0] - 0.25, s.head[1] - 0.45, s.head[2] - 0.1];
d.park();
check('anchored (plane or plinth fallback within 3 s)', ['plane', 'plinth'].includes(s.anchor), s.anchor);

// token 1: conveyor +10% — look, pinch-place in the slot
s = d.waitFor('conveyor token', (x) => held(x, 'set_conveyor_speed'));
const firstAt = s.t;
check('first token ≤ 15 s (C14)', firstAt <= 15, `${firstAt.toFixed(1)} s`);
let tok = held(s, 'set_conveyor_speed');
d.look(tok.at);
s = d.waitFor('inspect conveyor', (x) => x.focus === tok.id);
d.sleep(600);
s = d.probe();
tok = s.tokens.find((t) => t.id === tok.id);
check('look at token → card opens (C02)', s.focus === tok.id);
d.shot('t1-inspect');
d.carry(tok.at, s.slot, 'hand-right', tok.id);
s = d.waitFor('conveyor sealed', (x) => x.ledger.length >= 1);
check('place in slot → APPROVE (C05)', s.ledger[0].decision === 'APPROVE' && s.ledger[0].gesture === 'place');
check('seal glyph === token glyph (C10)', s.ledger[0].glyph === tok.glyph.slice(0, 16), s.ledger[0].glyph);
const satisfying = s.t;
check('satisfying moment ≤ 90 s (C14)', satisfying <= 90, `${satisfying.toFixed(1)} s`);

// token 2: arm 250°/s — scrub, amend 250 → 180, two-hand hold
s = d.waitFor('arm token', (x) => held(x, 'set_arm_velocity'));
tok = held(s, 'set_arm_velocity');
d.look(tok.at);
s = d.waitFor('inspect arm + handle', (x) => x.focus === tok.id && x.handleVisible);
check('arm rehearsal breaches walkway (C03)', tok.breach === 'walkway-w1');
const toward = [s.head[0] - s.handle[0], 0, s.head[2] - s.handle[2]];
const n = Math.hypot(toward[0], toward[2]);
d.carry(s.handle, [s.handle[0] + (toward[0] / n) * 0.12, s.handle[1], s.handle[2] + (toward[2] / n) * 0.12]);
s = d.probe();
check('pull handle → scrub forward (C03)', s.scrub > 0.8, `scrub=${s.scrub.toFixed(2)}`);
d.shot('t2-scrub');
// twist the dial counter-clockwise ~105° (7 steps of 10°/s down; clockwise raises the value)
const hand = 'hand-right';
d.move(hand, [s.dial[0], s.dial[1] + 0.005, s.dial[2]]);
const pose = d.cli(['xr', 'get-transform'], { device: hand });
const yaw0 = pose.euler?.yaw ?? 0;
d.pinch(hand, 1);
d.cli(['xr', 'animate-to'], { device: hand, orientation: { pitch: -70, yaw: yaw0 + 106, roll: 0 }, duration: 1.2 });
d.sleep(1600);
d.pinch(hand, 0);
d.park();
s = d.waitFor('arm amended', (x) => held(x, 'set_arm_velocity')?.value <= 180, 10);
tok = held(s, 'set_arm_velocity');
check('twist dial → 180°/s, breach clears (C04)', tok.value === 180 && tok.breach === null, `value=${tok.value} breach=${tok.breach}`);
d.shot('t2-amended');
d.carry(tok.at, s.slot, 'hand-right', tok.id);
s = d.waitFor('arm in slot', (x) => x.tokens.some((t) => t.id === tok.id && t.place === 'slot'), 10);
// abort first: both palms on, then one lifts before 1.5 s → nothing is sent, token returns
const at = s.tokens.find((t) => t.id === tok.id).at;
d.palms(at);
d.lift('hand-left', d.leftRest);
d.sleep(800);
d.park();
s = d.probe();
check('release before 1.5 s aborts, no decision (C06)', s.ledger.length === 1 && s.tokens.find((t) => t.id === tok.id)?.place === 'tray');
d.carry(s.tokens.find((t) => t.id === tok.id).at, s.slot, 'hand-right', tok.id);
s = d.waitFor('arm in slot again', (x) => x.tokens.some((t) => t.id === tok.id && t.place === 'slot'), 10);
const at2 = s.tokens.find((t) => t.id === tok.id).at;
d.move('hand-left', [at2[0] - 0.03, at2[1] + 0.01, at2[2]]);
d.move('hand-right', [at2[0] + 0.03, at2[1] + 0.01, at2[2]]);
s = d.waitFor('arm sealed', (x) => x.ledger.length >= 2, 10);
d.park();
check('two-hand hold 1.5 s → APPROVE_AMENDED (C06, C12)', s.ledger[1].decision === 'APPROVE_AMENDED' && s.ledger[1].gesture === 'two_hand_hold', JSON.stringify(s.ledger[1].amended_args));

// token 3: oven 450°C — slot locks, veto off the edge
s = d.waitFor('oven token', (x) => held(x, 'set_oven_setpoint'));
tok = held(s, 'set_oven_setpoint');
d.look(tok.at);
d.waitFor('inspect oven', (x) => x.focus === tok.id);
d.sleep(600);
s = d.probe();
tok = s.tokens.find((t) => t.id === tok.id);
d.carry(tok.at, s.slot, 'hand-right', tok.id);
s = d.waitFor('oven refused', (x) => x.tokens.find((t) => t.id === tok.id)?.place === 'tray', 10);
check('forbidden: slot locked, token returns (C08)', s.ledger.length === 2);
d.shot('t3-locked');
d.carry(s.tokens.find((t) => t.id === tok.id).at, s.offEdge, 'hand-right', tok.id);
s = d.waitFor('oven vetoed', (x) => x.ledger.length >= 3, 10);
check('push off desk edge → REJECT veto_push (C07)', s.ledger[2].decision === 'REJECT' && s.ledger[2].gesture === 'veto_push');

// token 4: drill pallet lift — approve it, miss the drill
s = d.waitFor('drill token', (x) => held(x, 'lift_pallet'));
tok = held(s, 'lift_pallet');
d.look(tok.at);
d.waitFor('inspect drill', (x) => x.focus === tok.id);
d.sleep(600);
s = d.probe();
tok = s.tokens.find((t) => t.id === tok.id);
d.carry(tok.at, s.slot, 'hand-right', tok.id);
s = d.waitFor('drill revealed', (x) => x.summary.drillsMissed === 1, 10);
check('drill revealed only after decision; miss recorded (C16)', s.calibration.startsWith('0%'), s.calibration);
d.shot('t4-drill');
s = d.waitFor('summary', (x) => x.beats.some((b) => b.startsWith('summary')), 20);
check('shift summary matches the log (C18)', s.summary.decisions === 4 && s.summary.amended === 1 && s.summary.vetoed === 1 && s.summary.drillsMissed === 1, JSON.stringify(s.summary));
d.shot('summary');
console.log('beats:', s.beats.join(' · '));

writeFileSync('../docs/e2e-onboarding.json', JSON.stringify({ at: new Date().toISOString(), results, beats: s.beats }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
