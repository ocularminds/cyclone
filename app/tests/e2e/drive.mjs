#!/usr/bin/env node
// Emulator e2e: plays the whole first shift hands-only (controllers never used)
// through the IWSDK CLI, asserting each beat. Needs `iwsdk dev up --allow-browser-automation`.
// Usage: node tests/e2e/drive.mjs [--shots]
import { writeFileSync } from 'node:fs';
import { Driver } from './driver.mjs';

const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const d = new Driver(process.argv.includes('--shots'));
const held = (s, tool) => s.tokens.find((t) => t.tool === tool && t.status === 'held' && (t.place === 'tray' || t.place === 'slot'));

// fresh first-visit state, then into XR with hands only
d.cli(['browser', 'run', 'tests/e2e/reset.mjs']);
d.page(`location.search = '?mode=onboarding'`);
d.sleep(5000);
d.cli(['xr', 'enter']);
d.cli(['xr', 'set-input-mode'], { mode: 'hand' });
d.sleep(1500);
d.calibrate();
let s = d.waitFor('anchor', (x) => x.ready && x.anchor !== 'pending');
d.rightRest = [s.head[0] + 0.25, s.head[1] - 0.3, s.head[2] - 0.1];
d.leftRest = [s.head[0] - 0.25, s.head[1] - 0.3, s.head[2] - 0.1];
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
