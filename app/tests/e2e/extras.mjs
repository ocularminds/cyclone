#!/usr/bin/env node
// Emulator e2e, part 2 (hands only): escalate pad, one-handed hold, Gaze + pinch
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
// A lost required input cannot finish the commitment. This models source
// disconnection; the sub-150 ms pose-dropout tolerance is unit-tested separately.
d.cli(['xr', 'set-connected'], { device: 'hand-right', connected: false });
d.sleep(500);
s = d.probe();
check('required hand disconnect cancels without a decision', s.ledger.length === 1 && s.tokens.find(t => t.id === tok.id)?.place === 'tray');
d.cli(['xr', 'set-connected'], { device: 'hand-right', connected: true });
d.park();
s = d.probe();tok = s.tokens.find(t => t.id === tok.id);d.look(tok.at);
d.carry(tok.at, s.slot, 'hand-right', tok.id);
s = d.waitFor('arm in slot after tracking returns', x => x.tokens.some(t => t.id === tok.id && t.place === 'slot'), 10);
const fresh = s.tokens.find(t => t.id === tok.id).at;
d.look([s.slot[0], s.slot[1] + 0.01, s.slot[2]]);
d.move('hand-right', [fresh[0] + 0.02, fresh[1] + 0.01, fresh[2]]);
s = d.waitFor('one-hand sealed', (x) => x.ledger.length >= 2, 10);
d.park();
check('one hand + gaze on the seal 1.5 s → APPROVE (C26)', s.ledger[1].gesture === 'one_hand_gaze_hold', s.ledger[1].gesture);
d.page(`window.cyclone.app.settings.set('oneHanded', false)`);

// Gaze + pinch: head-directed inspection, hand-ray chute selection (C25).
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
check('Gaze + pinch: chute selection vetoes the inspected token (C25)', s.ledger[2].decision === 'REJECT' && s.ledger[2].gesture === 'gaze_pinch', s.ledger[2].gesture);
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
const queueStart = Number(s.beats.find(b => b.startsWith('held_1@'))?.split('@')[1] ?? s.t);
check('handover: overnight queue loads, first token ≤ 15 s (C15)', queueStart <= 15, `${s.tokens.length} held; first at ${queueStart.toFixed(1)} s`);
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

// Revoke through the actual UIKit controls, then introduce a matching proposal
// as test data. Revocation must affect behavior, not only the displayed setting.
s=d.probe();d.move('hand-right',[s.puck[0],s.puck[1]+.12,s.puck[2]]);d.move('hand-right',[s.puck[0],s.puck[1]+.01,s.puck[2]]);d.pinch('hand-right',1);d.pinch('hand-right',0);
d.waitFor('settings for revocation',s=>s.settingsOpen);d.lift('hand-right',[s.head[0]+.2,s.head[1]-.15,s.head[2]-.15]);d.sleep(700);
const action = id => {
  const actions=d.page(`window.cyclone.stage.root.getObjectByName('settings-panel').userData.actions`);
  const i=actions.findIndex(a=>a.id===id);if(i<0)throw Error(`Missing settings action ${id}`);d.click('settings-panel',`action-${'abc'[i]}`);
};
action('page:session');action('page:advanced');action('page:rules');action('revoke');
check('Revoke control removes accepted rule authority',d.page(`window.cyclone.app.trust.accepted().length`)===0);
d.click('settings-panel','close');
const freshId=d.page(`(async()=>{const a=window.cyclone.app,t=await a.engine.factory.build(a.engine.template('conveyor-2'));await a.shift.receive(t);return t.intent_id})()`);
s=d.waitFor('revoked rule requires review',s=>s.tokens.some(t=>t.id===freshId&&t.status==='held'));
check('matching proposal stays held after revocation',s.tokens.some(t=>t.id===freshId&&t.status==='held'));

writeFileSync(process.env.CYCLONE_EVIDENCE ? `${process.env.CYCLONE_EVIDENCE}/e2e-extras.json` : '../docs/e2e-extras.json', JSON.stringify({ at: new Date().toISOString(), source: 'IWSDK IWER, hands only', results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
