import { describe, expect, it } from 'vitest';
import type { DemoVerification } from '../src/contracts/intent';
import type { ScenarioFile } from '../src/contracts/scenario';
import { Glyph } from '../src/core/glyph';
import { IntentHasher } from '../src/core/hash';
import { Store } from '../src/state/store';
import onboarding from '../src/scenario/onboarding.json';
import handover from '../src/scenario/handover.json';
import drills from '../src/scenario/drills.json';
import { Rig } from './rig';

const ONBOARDING = onboarding as ScenarioFile;

describe('core loop in demo mode (C01–C13)', () => {
  it('conveyor: place in slot → APPROVE sealed, glyph(token) === glyph(seal), signature verifies', async () => {
    const rig = new Rig(ONBOARDING);
    await rig.start();
    const tok = await rig.next('set_conveyor_speed');
    expect(rig.clock.seconds).toBeLessThanOrEqual(15); // first token ≤ 15 s (C14)
    const rec = await rig.shift.decide(tok.id, 'APPROVE', 'place');
    expect(rec?.decision.decision).toBe('APPROVE');
    expect(rec?.intent_hash).toBe(tok.intent.intent_hash);
    expect(Glyph.from(rec!.intent_hash).equals(tok.glyph)).toBe(true);
    expect(await rig.signer.verify(rec!)).toBe(true);
    const tampered = { ...rec!, rehearsal: { ...rec!.rehearsal, args: { speed_pct: 99 } } };
    expect(await rig.signer.verify(tampered)).toBe(false);
    expect((rec!.verification as DemoVerification).key_id).toMatch(/^demo-/);
  });

  it('arm: amend 250 → 180 clears breach, two-hand hold → APPROVE_AMENDED with distinct amended hash', async () => {
    const rig = new Rig(ONBOARDING);
    await rig.start();
    await rig.shift.decide((await rig.next('set_conveyor_speed')).id, 'APPROVE', 'place');
    const arm = await rig.next('set_arm_velocity');
    expect(arm.rehearsal.breach?.zone_id).toBe('walkway-w1');
    expect(await rig.shift.decide(arm.id, 'APPROVE', 'place')).toBeNull(); // two_hand needs the hold
    const glyphBefore = arm.glyph.key;
    await rig.shift.amend(arm.id, 180);
    expect(arm.rehearsal.breach).toBeNull();
    expect(arm.hash).not.toBe(arm.intent.intent_hash);
    expect(arm.glyph.key).not.toBe(glyphBefore);
    const rec = await rig.shift.decide(arm.id, 'APPROVE', 'two_hand_hold');
    expect(rec?.decision.decision).toBe('APPROVE_AMENDED');
    expect(rec?.amended_hash).toBe(arm.hash);
    expect(rec?.decision.amended_args).toMatchObject({ deg_s: 180 });
    expect(Glyph.from(rec!.amended_hash!).equals(arm.glyph)).toBe(true);
  });

  it('amended value outside the policy ceiling is denied and the token stays held (C12)', async () => {
    const rig = new Rig(ONBOARDING);
    await rig.start();
    await rig.shift.decide((await rig.next('set_conveyor_speed')).id, 'APPROVE', 'place');
    const arm = await rig.next('set_arm_velocity');
    await rig.shift.amend(arm.id, 220);
    const denied: string[] = [];
    rig.shift.events.on('denied', ({ reason }) => denied.push(reason));
    expect(await rig.shift.decide(arm.id, 'APPROVE', 'two_hand_hold')).toBeNull();
    expect(arm.status).toBe('held');
    expect(denied[0]).toMatch(/ceiling is 180/);
    expect(arm.denial).toMatch(/180/);
  });

  it('counter-offer path when amended approval is unsupported: agent re-proposes 180°/s (C12)', async () => {
    const rig = new Rig(ONBOARDING, { amend: false });
    await rig.start();
    await rig.shift.decide((await rig.next('set_conveyor_speed')).id, 'APPROVE', 'place');
    const arm = await rig.next('set_arm_velocity');
    await rig.shift.amend(arm.id, 180);
    const rec = await rig.shift.decide(arm.id, 'APPROVE', 'two_hand_hold');
    expect(rec?.decision.decision).toBe('REJECT');
    expect(rec?.decision.reason).toEqual({ code: 'counter_offer', suggested: { deg_s: 180 } });
    await rig.advance(3);
    const re = rig.shift.waiting().find((t) => t.intent.supersedes === arm.id)!;
    expect(re.intent.args.deg_s).toBe(180);
    expect(re.rehearsal.breach).toBeNull();
    const ok = await rig.shift.decide(re.id, 'APPROVE', 'two_hand_hold');
    expect(ok?.decision.decision).toBe('APPROVE');
  });

  it('forbidden oven: slot locks; veto and escalate still work (C07–C09)', async () => {
    const rig = new Rig(ONBOARDING);
    await rig.start();
    await rig.shift.decide((await rig.next('set_conveyor_speed')).id, 'APPROVE', 'place');
    const arm = await rig.next('set_arm_velocity');
    await rig.shift.amend(arm.id, 180);
    await rig.shift.decide(arm.id, 'APPROVE', 'two_hand_hold');
    const oven = await rig.next('set_oven_setpoint');
    const refusals: string[] = [];
    rig.shift.events.on('refused', ({ reason }) => refusals.push(reason));
    expect(await rig.shift.decide(oven.id, 'APPROVE', 'place')).toBeNull();
    expect(refusals[0]).toMatch(/locked/);
    const esc = await rig.shift.decide(oven.id, 'ESCALATE', 'escalate_place');
    expect(esc?.decision.decision).toBe('ESCALATE');
    expect(oven.status).toBe('escalated');
  });

  it('veto: push off the edge → REJECT user_veto', async () => {
    const rig = new Rig(ONBOARDING);
    await rig.start();
    const tok = await rig.next('set_conveyor_speed');
    const rec = await rig.shift.decide(tok.id, 'REJECT', 'veto_push');
    expect(rec?.decision.reason?.code).toBe('user_veto');
  });

  it('tampered payload is refused by the gate (hash binding, C13)', async () => {
    const rig = new Rig(ONBOARDING);
    await rig.start();
    const tok = await rig.next('set_conveyor_speed');
    tok.intent.binding!.action.parameters.speed_pct = 50; // payload changed after hold
    expect(await IntentHasher.matches(tok.intent)).toBe(false);
    const refusals: string[] = [];
    rig.shift.events.on('refused', ({ reason }) => refusals.push(reason));
    expect(await rig.shift.decide(tok.id, 'APPROVE', 'place')).toBeNull();
    expect(refusals[0]).toMatch(/payload changed/);
  });

  it('drill: approving the pallet lift reveals "missed"; calibration updates (C16)', async () => {
    const rig = new Rig(ONBOARDING);
    await rig.start();
    await rig.shift.decide((await rig.next('set_conveyor_speed')).id, 'APPROVE', 'place');
    const arm = await rig.next('set_arm_velocity');
    await rig.shift.amend(arm.id, 180);
    await rig.shift.decide(arm.id, 'APPROVE', 'two_hand_hold');
    await rig.shift.decide((await rig.next('set_oven_setpoint')).id, 'REJECT', 'veto_push');
    const drill = await rig.next('lift_pallet');
    const reveals: boolean[] = [];
    rig.shift.events.on('drill', ({ caught }) => reveals.push(caught));
    await rig.shift.decide(drill.id, 'APPROVE', 'place');
    expect(reveals).toEqual([false]);
    expect(rig.calibration.score).toBe(0);
    const s = rig.log.summary();
    expect(s).toMatchObject({ decisions: 4, amended: 1, vetoed: 1, drillsMissed: 1 });
    expect(rig.engine.finished).toBe(true);
  });

  it('expiry auto-rejects (fail closed) and the clock pause freezes TTL (C29)', async () => {
    const rig = new Rig(ONBOARDING);
    await rig.start();
    const tok = await rig.next('set_conveyor_speed');
    rig.clock.pause();
    await rig.advance(700, 10);
    expect(tok.status).toBe('held');
    rig.clock.resume();
    const expired: string[] = [];
    rig.shift.events.on('expired', (t) => expired.push(t.id));
    await rig.advance(605, 5);
    expect(expired).toEqual([tok.id]);
    expect(tok.record?.decision.reason?.code).toBe('expired');
    expect(tok.record?.decision.gesture).toBe('timeout');
  });

  it('idempotent resolve per intent_id', async () => {
    const rig = new Rig(ONBOARDING);
    await rig.start();
    const tok = await rig.next('set_conveyor_speed');
    const d = { intent_id: tok.id, decision: 'APPROVE' as const, intent_hash: tok.intent.intent_hash, gesture: 'place' as const, client_ts: '' };
    const a = await rig.gate.resolve(d);
    const b = await rig.gate.resolve(d);
    expect(b).toBe(a);
  });

  it('gaze-pinch approves low-risk single intents only in eyes-only mode (C25)', async () => {
    const rig = new Rig(ONBOARDING);
    await rig.start();
    const tok = await rig.next('set_conveyor_speed');
    expect(await rig.shift.decide(tok.id, 'APPROVE', 'gaze_pinch')).toBeNull();
    rig.settings.set('eyesOnly', true);
    expect((await rig.shift.decide(tok.id, 'APPROVE', 'gaze_pinch'))?.decision.gesture).toBe('gaze_pinch');
  });
});

describe('habit loop (C15–C19)', () => {
  it('trust ring fills, rule offered, accepted rule auto-seals matching intents', async () => {
    const rig = new Rig(handover as ScenarioFile);
    await rig.start();
    const offers: string[] = [];
    rig.shift.events.on('offer', ({ rule }) => offers.push(rule.id));
    const autos: string[] = [];
    rig.shift.events.on('auto', ({ token }) => autos.push(token.intent.tool));
    // first token ≤ 15 s in handover (C15)
    const c4 = await rig.next('set_conveyor_speed');
    expect(rig.clock.seconds).toBeLessThanOrEqual(15);
    await rig.shift.decide(c4.id, 'APPROVE', 'place');
    const c3 = await rig.next('set_conveyor_speed');
    await rig.shift.decide(c3.id, 'APPROVE', 'place');
    expect(rig.trust.ring('line-agent')).toBeCloseTo(2 / 3);
    const lift = await rig.next('lift_pallet');
    await rig.shift.decide(lift.id, 'APPROVE', 'place');
    expect(offers).toEqual(['conveyor-under-5']);
    expect(rig.shift.acceptRule('conveyor-under-5', 'cell-agent')).toBe(false);
    expect(rig.shift.acceptRule('conveyor-under-5', 'line-agent')).toBe(true);
    await rig.advance(6);
    expect(autos).toEqual(['set_conveyor_speed']);
    const autoRec = rig.ledger.own().find((r) => r.decision.decision === 'AUTO_APPROVE_RULE');
    expect(autoRec?.decision.gesture).toBe('rule');
  });

  it('state persists across reloads and reset clears it; works without storage', async () => {
    const mem = new Map<string, string>();
    const fake = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
      clear: () => mem.clear(),
    } as Storage;
    const rig = new Rig(ONBOARDING, { store: new Store('p.', fake) });
    await rig.start();
    const tok = await rig.next('set_conveyor_speed');
    const rec = await rig.shift.decide(tok.id, 'APPROVE', 'place');
    const reloaded = new Rig(ONBOARDING, { store: new Store('p.', fake) });
    expect(reloaded.ledger.own().map((r) => r.record_id)).toEqual([rec!.record_id]);
    expect(await reloaded.signer.verify(rec!)).toBe(true); // same per-install key
    expect(reloaded.trust.ring('line-agent')).toBeCloseTo(1 / 3);
    reloaded.store.clear();
    expect(new Rig(ONBOARDING, { store: new Store('p.', fake) }).ledger.own()).toEqual([]);
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } as unknown as Storage;
    const rig2 = new Rig(ONBOARDING, { store: new Store('b.', broken) });
    await rig2.start();
    expect((await rig2.shift.decide((await rig2.next('set_conveyor_speed')).id, 'APPROVE', 'place'))?.decision.decision).toBe('APPROVE');
  });

  it('drill injection is seeded and never labelled before the decision', async () => {
    const rig = new Rig(handover as ScenarioFile, { drills: drills as ScenarioFile, drillChance: 1, seed: 3 });
    expect(rig.engine.beatList.some((b) => b.beat === 'drill_injected')).toBe(true);
    const capture = new Rig(handover as ScenarioFile, { drills: drills as ScenarioFile, drillChance: 0 });
    expect(capture.engine.beatList.some((b) => b.beat === 'drill_injected')).toBe(false);
  });
});
