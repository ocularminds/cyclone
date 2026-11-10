import { describe, expect, it, vi } from 'vitest';
import type { Cast, ScenarioFile } from '../src/contracts/scenario';
import { Receipt } from '../src/core/receipt';
import { IntentHasher } from '../src/core/hash';
import { Ledger } from '../src/state/ledger';
import { Store } from '../src/state/store';
import { TrustBook } from '../src/state/trust';
import { Calibration } from '../src/state/calibration';
import { DemoSigner } from '../src/core/signer';
import { Rig } from './rig';
import onboarding from '../src/scenario/onboarding.json';
import cast from '../src/scenario/agents.json';

const single = (key: string): ScenarioFile => ({ ...onboarding, beats: [{ template: key, beat: key, at: 0 }] }) as ScenarioFile;
async function arm() {
  const rig = new Rig(single('arm')); await rig.start(); const token = await rig.next('set_arm_velocity');
  await rig.shift.amend(token.id, 180);
  const record = (await rig.shift.decide(token.id, 'APPROVE', 'two_hand_hold'))!;
  return { rig, token, record };
}

describe('immutable retained evidence', () => {
  it('retains the original breach and amended safe path, including model, zones, units and starting geometry', async () => {
    const { rig, record } = await arm();
    const s = record.rehearsal.snapshot!;
    expect(s.original.breach?.zone_id).toBeTruthy(); expect(s.reviewed.breach).toBeNull();
    expect(s.original.args.deg_s).toBe(250); expect(s.reviewed.args.deg_s).toBe(180);
    expect(s.original_hash).not.toBe(s.reviewed_hash);
    expect(await Receipt.check(record)).toBe(true);
    for (const change of [
      (s: typeof record.rehearsal.snapshot) => { s!.scene.assets[0].params.base_speed = 99; },
      (s: typeof record.rehearsal.snapshot) => { s!.scene.zones = []; },
      (s: typeof record.rehearsal.snapshot) => { s!.original.poses[0].center[0] += 0.01; },
      (s: typeof record.rehearsal.snapshot) => { s!.units.space = 'feet' as 'metres'; },
    ]) {
      const bad = structuredClone(record); change(bad.rehearsal.snapshot);
      expect(await Receipt.check(bad)).toBe(false); expect(await rig.signer.verify(bad)).toBe(false);
    }
    expect(new Ledger(rig.store).all()[0].rehearsal).toEqual(record.rehearsal);
  });
  it('does not accept a re-digested snapshot whose arguments, action, mutation or identity are detached', async () => {
    const { record } = await arm();
    for (const change of [
      (r: typeof record) => { r.rehearsal.snapshot!.reviewed.args.deg_s = 250; },
      (r: typeof record) => { r.rehearsal.snapshot!.asset_id = 'conv-1'; },
      (r: typeof record) => { r.decision.amended_args!.deg_s = 250; },
      (r: typeof record) => { r.rehearsal.snapshot!.reviewed_binding.intent_id = 'other-intent'; },
      (r: typeof record) => { r.intent_id = 'other-intent'; },
    ]) {
      const bad = structuredClone(record); change(bad);
      bad.rehearsal.path_samples_ref = await Receipt.digest(bad.rehearsal.snapshot!);
      expect(await Receipt.check(bad)).toBe(false);
    }
  });
  it('quarantines corrupt ledger entries; malformed and legacy history remains unavailable without throwing', async () => {
    const { record } = await arm();
    for (const malformed of [null, {}, { version: 'cyclone.rehearsal/1' }, { ...record.rehearsal.snapshot, reviewed: { poses: [null] } }]) {
      const bad = structuredClone(record); bad.rehearsal.snapshot = malformed as any;
      await expect(Receipt.check(bad)).resolves.toBe(false); expect(Receipt.result(bad)).toBeNull();
    }
    const store = new Store('corrupt.', null); store.write('ledger', [null, record, { decision: {} }]);
    expect(new Ledger(store).all()).toHaveLength(1); expect(store.read('ledgerCorrupt', [])).toHaveLength(3);
    store.write('demoKey', 'invalid-key'); const signer = new DemoSigner(store);
    await expect(signer.verify(record)).resolves.toBe(false); expect((await signer.publicJwk()).kty).toBe('OKP');
  });
});

describe('bounded saved delegation', () => {
  it('never inherits a grant when its saved scope changes; preserves progress without legacy authority', async () => {
    const rig = new Rig(single('conveyor')); await rig.start(); const i = (await rig.next('set_conveyor_speed')).intent;
    const store = new Store('bounded.', null), rules = structuredClone((cast as Cast).rules);
    const book = new TrustBook(store, rules, () => 1000);
    for (let n = 0; n < 3; n++) book.record(i, 'clean');
    expect(book.accept(rules[0].id, i.agent.id)).toBe(true);
    const candidate = { ...i, args: { ...i.args, speed_pct: 4 } };
    expect(new TrustBook(store, rules, () => 1000).match(candidate)).not.toBeNull();
    for (const change of [{ max: 10 }, { min: -10 }, { asset_id: 'other' }, { agent_id: 'other' }, { tool: 'other' }, { unit: 'm/s' }, { fixed_args: { line: 2 } }, { lifetime_s: 86400 }]) {
      const changed = [{ ...rules[0], ...change }];
      const reload = new TrustBook(store, changed, () => 1000);
      expect(reload.accepted()).toHaveLength(0); expect(reload.status(rules[0].id)).toBe('revoked');
    }
    expect(book.match({ ...candidate, args: { ...candidate.args, line: 2 } })).toBeNull();
    expect(book.match({ ...candidate, args: { ...candidate.args, extra_action: true } })).toBeNull();
    const legacy = store.read<any>('trust', null); legacy.version = 2; store.write('trust', legacy);
    const migrated = new TrustBook(store, rules, () => 1000);
    expect(migrated.ring(i.agent.id)).toBe(1); expect(migrated.accepted()).toHaveLength(0);
    expect(store.read('trustLegacy', null)).not.toBeNull();
  });
  it('revocation during snapshot capture stops an already queued automatic approval', async () => {
    const rig = new Rig(single('conveyor')); await rig.start(); const token = await rig.next('set_conveyor_speed');
    for (let n = 0; n < 3; n++) rig.trust.record(token.intent, 'clean');
    const id = (cast as Cast).rules[0].id; rig.trust.accept(id, token.intent.agent.id);
    const candidate = structuredClone(token.intent); candidate.intent_id = candidate.binding!.intent_id = crypto.randomUUID();
    candidate.args.speed_pct = 4; candidate.binding = IntentHasher.amend(candidate.binding!, candidate.args);
    candidate.intent_hash = (await IntentHasher.hash(candidate.binding)).intent_hash;
    const capture = Receipt.capture.bind(Receipt);
    const spy = vi.spyOn(Receipt, 'capture').mockImplementation(async (...args) => { const r = await capture(...args); rig.trust.revoke(id); return r; });
    const resolve = vi.spyOn(rig.gate, 'resolve');
    try { expect((await rig.shift.receive(candidate)).status).toBe('held'); expect(resolve).not.toHaveBeenCalled(); }
    finally { spy.mockRestore(); }
  });
  it('sanitizes malformed progress and calibration without manufacturing successful assessments', () => {
    const store = new Store('invalid.', null);
    store.write('trust', { version: 3, agents: { bad: { streak: Infinity, clean: 0, total: -1 } }, grants: null });
    expect(new TrustBook(store, (cast as Cast).rules).ring('bad')).toBe(0);
    store.write('calibration', { version: 2, caught: 50, drills: 1 });
    const c = new Calibration(store); expect(c.score).toBeNull(); expect(c.label).toBe('No assessed drills');
    c.record('corrected'); c.record('timeout'); c.record('escalated'); c.falseAlarm();
    expect(new Calibration(store).stats).toMatchObject({ drills: 2, caught: 1, corrected: 1, timeouts: 1, escalated: 1, falseAlarms: 1 });
  });
  it('scores drill expiry as missed, corrected breach as caught, escalation as unassessed and safe veto as a false alarm', async () => {
    const expired = new Rig(single('drill-lift')); await expired.start(); const lift = await expired.next('lift_pallet');
    expired.clock.advance(lift.deadlineMs / 1000 + 1); expired.shift.tick();
    await vi.waitFor(() => expect(expired.calibration.stats).toMatchObject({ drills: 1, caught: 0, timeouts: 1 }));
    const safe = new Rig(single('conveyor')); await safe.start(); const belt = await safe.next('set_conveyor_speed');
    await safe.shift.decide(belt.id, 'REJECT', 'veto_push'); expect(safe.calibration.stats.falseAlarms).toBe(1);
    const corrected = new Rig(single('drill-lift')); await corrected.start(); const c = await corrected.next('lift_pallet');
    await corrected.shift.amend(c.id, 900); await corrected.shift.decide(c.id, 'APPROVE', 'place');
    expect(corrected.calibration.stats).toMatchObject({ drills: 1, caught: 1, corrected: 1 });
    const escalated = new Rig(single('drill-lift')); await escalated.start(); const e = await escalated.next('lift_pallet');
    await escalated.shift.decide(e.id, 'ESCALATE', 'escalate_place');
    expect(escalated.calibration.score).toBeNull(); expect(escalated.log.summary().drillsUnassessed).toBe(1);
  });
});
