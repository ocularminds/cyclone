import { describe, expect, it, vi } from 'vitest';
import type { Cast, ScenarioFile } from '../src/contracts/scenario';
import { Commitment, type HoldInput } from '../src/flow/commitment';
import { Preferences } from '../src/state/preferences';
import { Settings } from '../src/state/settings';
import { Store } from '../src/state/store';
import { FirstShift } from '../src/state/onboarding';
import { Calibration } from '../src/state/calibration';
import { TrustBook } from '../src/state/trust';
import { Receipt } from '../src/core/receipt';
import { Proof } from '../src/core/proof';
import { ScenarioEngine } from '../src/scenario/engine';
import { Rng } from '../src/core/rng';
import { Clock } from '../src/core/clock';
import { Rehearsal, type TwinLayout } from '../src/sim/rehearsal';
import { Motion } from '../src/sim/kinematics';
import { Placement } from '../src/models/placement';
import { Layout } from '../src/models/layout';
import onboarding from '../src/scenario/onboarding.json';
import cast from '../src/scenario/agents.json';
import twin from '../src/scenario/twin.json';
import tokens from '../src/ui/tokens.json';
import { Rig } from './rig';

const single = (key: string): ScenarioFile => ({ ...onboarding, beats: [{ template: key, beat: key, at: 0 }] }) as ScenarioFile;
const prefs = (settings: Settings) => new Preferences(settings, () => ({ live: false, liveAvailable: false, amended: settings.get('amendedApproval'), input: 'Head direction + hand ray', progress: 'First shift', rule: null }));

describe('paged settings and resume', () => {
  it('requires the reset page and a deliberate second action; cancellation preserves state', () => {
    const store = new Store('design.', null), settings = new Settings(store), p = prefs(settings);
    settings.set('textScale', 1.25); store.write('ledger', ['receipt']);
    expect(p.act('confirm-reset')).toBeNull();
    p.act('page:session'); p.act('page:advanced'); p.act('page:rules'); p.act('page:reset');
    expect(p.view().note).toMatch(/seals, rules, scores/);
    p.act('cancel'); expect(p.page).toBe('advanced');
    expect(store.read('ledger', [])).toEqual(['receipt']); expect(settings.get('textScale')).toBe(1.25);
    p.act('page:rules'); p.act('page:reset'); expect(p.act('confirm-reset')).toBe('reset');
    expect(p.act('close')).toBe('close');
  });
  it('keeps the selected input path exclusive, remembers handedness and does not enable unavailable live mode', () => {
    const store = new Store('design.', null), s = new Settings(store), p = prefs(s);
    p.act('page:input'); p.act('gaze'); expect(s.get('eyesOnly')).toBe(true);
    p.act('onehand'); p.act('left'); expect(s.snapshot()).toMatchObject({ eyesOnly: false, oneHanded: true, preferredHand: 'left' });
    p.act('back'); p.act('back'); p.act('page:display'); p.act('text'); p.act('page:comfort'); p.act('reducedMotion');
    expect(new Settings(store).snapshot()).toMatchObject({ textScale: 1.25, reducedMotion: true, preferredHand: 'left' });
    p.page = 'advanced'; expect(p.act('mode')).toBeNull(); expect(p.view().note).toMatch(/requires a configured relay/);
    expect(s.get('mode')).toBe('demo');
  });
  it('ignores malformed settings and works when persistent storage is blocked', () => {
    const broken = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } as unknown as Storage;
    const store = new Store('design.', broken);
    store.write('settings', { textScale: 3, captions: 'false', theme: 'neon', preferredHand: 'both' });
    const settings = new Settings(store); expect(settings.snapshot()).toMatchObject({ textScale: 1, captions: true, theme: 'ink', preferredHand: 'right' });
    settings.set('textScale', 1.25); expect(new Settings(store).get('textScale')).toBe(1.25);
  });
  it('refresh resumes only unfinished beats with fresh intents; a visit never means completion', async () => {
    const store = new Store('design.', null); store.write('visits', 8);
    const first = new FirstShift(store); expect(first.completed).toBe(false);
    first.save(['conveyor']); const reloaded = new FirstShift(store);
    const clock = new Clock(), engine = new ScenarioEngine(cast as Cast, onboarding as ScenarioFile, clock, new Rng(9), { completedTemplates: reloaded.finished });
    const spawned: string[] = []; engine.onSpawn(s => spawned.push(s.key)); engine.tick(); await Rig.flush();
    expect(spawned).toEqual(['arm']); expect(engine.finished).toBe(false);
    reloaded.save(['conveyor', 'arm', 'oven', 'drill-lift'], true); expect(new FirstShift(store).completed).toBe(true);
    reloaded.reset(); expect(new FirstShift(store).completed).toBe(false);
  });
});

describe('deliberate hold', () => {
  const input: HoldInput = { delta: 0.1, tracked: true, engaged: true, permitted: true, binding: 'reviewed-A' };
  it('freezes immediately during tracking loss, including just before completion', () => {
    const h = new Commitment(); for (let i = 0; i < 14; i++) h.step(input);
    expect(h.step({ ...input, tracked: false })).toBe('interrupted'); expect(h.elapsed).toBeCloseTo(1.4);
    expect(h.step({ ...input, tracked: false })).toBe('cancelled'); expect(h.elapsed).toBe(0);
    expect(h.step(input)).toBe('holding'); expect(h.elapsed).toBeCloseTo(0.1);
  });
  it.each(['release', 'edit', 'pause'] as const)('%s cancels immediately and requires a full new hold', why => {
    const h = new Commitment(); for (let i = 0; i < 10; i++) h.step(input);
    const stop = why === 'release' ? { engaged: false } : why === 'edit' ? { binding: 'reviewed-B' } : { permitted: false };
    expect(h.step({ ...input, ...stop })).toBe('cancelled'); expect(h.elapsed).toBe(0);
    for (let i = 0; i < 14; i++) expect(h.step(input)).toBe('holding');
    expect(h.step(input)).toBe('complete');
  });
});

describe('reviewed values and immutable receipt', () => {
  it('rejects invalid values without changing the last rehearsal or allowing an approval', async () => {
    const rig = new Rig(single('arm')); await rig.start(); const arm = await rig.next('set_arm_velocity');
    await rig.shift.amend(arm.id, 180); const hash = arm.hash, result = arm.rehearsal;
    for (const value of [NaN, Infinity, 310, 50, 181]) {
      expect(await rig.shift.amend(arm.id, value)).toBeNull(); expect(arm.hash).toBe(hash); expect(arm.rehearsal).toBe(result);
      expect(await rig.shift.decide(arm.id, 'APPROVE', 'two_hand_hold')).toBeNull();
    }
    await rig.shift.amend(arm.id, 180); expect(arm.validation).toBeNull();
    expect((await rig.shift.decide(arm.id, 'APPROVE', 'two_hand_hold'))?.decision.amended_args).toMatchObject({ deg_s: 180 });
  });
  it('blocks duplicate activation while busy and binds the retained rehearsal to the final amendment', async () => {
    const rig = new Rig(single('arm')); await rig.start(); const arm = await rig.next('set_arm_velocity');
    const a = rig.shift.amend(arm.id, 170), b = rig.shift.amend(arm.id, 180); await Promise.all([a, b]);
    const resolve = vi.spyOn(rig.gate, 'resolve');
    const [record, duplicate] = await Promise.all([rig.shift.decide(arm.id, 'APPROVE', 'two_hand_hold'), rig.shift.decide(arm.id, 'APPROVE', 'two_hand_hold')]);
    expect(duplicate).toBeNull(); expect(resolve).toHaveBeenCalledTimes(1);
    expect(record?.rehearsal.snapshot?.reviewed.args.deg_s).toBe(180); expect(await Receipt.check(record!)).toBe(true);
  });
  it('replays the retained poses after a model update and a JSON reload, and refuses tampered or legacy history', async () => {
    const rig = new Rig(single('arm')); await rig.start(); const arm = await rig.next('set_arm_velocity');
    await rig.shift.amend(arm.id, 180); const record = (await rig.shift.decide(arm.id, 'APPROVE', 'two_hand_hold'))!;
    const reload = JSON.parse(JSON.stringify(record)); const before = Receipt.result(record)!;
    const changed = structuredClone(twin) as unknown as TwinLayout; changed.assets.find(a => a.id === record.asset_id)!.position[0] += 2;
    const today = new Rehearsal(changed).run(record.tool!, record.asset_id!, record.rehearsal.args);
    const after = Receipt.result(reload)!; expect([...after.samples]).toEqual([...before.samples]); expect([...today.samples]).not.toEqual([...after.samples]);
    expect(Receipt.pose(after, 0.47, Motion.blank())).toEqual(Receipt.pose(before, 0.47, Motion.blank()));
    expect(await Receipt.check(reload)).toBe(true); expect(await rig.signer.verify(reload)).toBe(true);
    reload.rehearsal.snapshot.reviewed.samples[0] += 0.5; expect(await Receipt.check(reload)).toBe(false); expect(await rig.signer.verify(reload)).toBe(false);
    const legacy = structuredClone(record); delete legacy.rehearsal.snapshot; expect(Receipt.result(legacy)).toBeNull(); expect(await Receipt.check(legacy)).toBe(false);
  });
  it('cannot label a proof official when action binding or coverage is missing', async () => {
    const rig = new Rig(single('conveyor')); await rig.start(); const token = await rig.next('set_conveyor_speed');
    const record = (await rig.shift.decide(token.id, 'APPROVE', 'place'))!;
    expect(Proof.official(record)).toBe(false);
    const live = { ...record, source: 'live' as const, verification: { verified: true, required_artifact_coverage_verified: true, trust_anchor: 'DECIONIS_OFFICIAL', issuer_tier: 'owned', assurance_scope_summary: '', checked_at: '' } };
    expect(Proof.official(live)).toBe(false);
    expect(Proof.matches({ ...record, intent_id: 'another-action' }, record.decision)).toBe(false);
  });
  it('quarantines a mismatched response after sending instead of sealing or sending again', async () => {
    const rig = new Rig(single('conveyor')); await rig.start(); const token = await rig.next('set_conveyor_speed');
    const resolve = rig.gate.resolve.bind(rig.gate);
    const call = vi.spyOn(rig.gate, 'resolve').mockImplementation(async (decision, reviewed) => ({ ...(await resolve(decision, reviewed)), intent_id: 'wrong-action' }));
    expect(await rig.shift.decide(token.id, 'APPROVE', 'place')).toBeNull();
    expect(token.status).toBe('unverified'); expect(token.denial).toMatch(/already sent/); expect(rig.ledger.own()).toHaveLength(0);
    expect(await rig.shift.decide(token.id, 'APPROVE', 'place')).toBeNull(); expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('honest scores and bounded delegation', () => {
  it('counts timeout as missed, escalation as unassessed, and false alarms separately', () => {
    const c = new Calibration(new Store('design.', null));
    c.record('caught'); c.record('timeout'); c.record('escalated'); c.falseAlarm();
    expect(c.score).toBe(0.5); expect(c.stats).toMatchObject({ caught: 1, drills: 2, timeouts: 1, escalated: 1, falseAlarms: 1 });
  });
  it('never accepts an unoffered rule, and matches exact bounds, asset, risk, units and expiry', async () => {
    let now = 1_000; const book = new TrustBook(new Store('design.', null), (cast as Cast).rules, () => now);
    const rig = new Rig(single('conveyor')); await rig.start(); const intent = (await rig.next('set_conveyor_speed')).intent;
    expect(book.accept('conveyor-under-5', 'line-agent')).toBe(false);
    for (let i = 0; i < 3; i++) book.record(intent, 'clean');
    expect(book.accept('conveyor-under-5', 'cell-agent')).toBe(false); expect(book.accept('conveyor-under-5', 'line-agent')).toBe(true);
    const candidate = structuredClone(intent); candidate.args.speed_pct = 5;
    expect(book.match(candidate)?.id).toBe('conveyor-under-5'); candidate.args.speed_pct = 0; expect(book.match(candidate)).not.toBeNull();
    for (const speed of [-1, 5.1, NaN, Infinity]) { candidate.args.speed_pct = speed; expect(book.match(candidate)).toBeNull(); }
    candidate.args.speed_pct = 4;
    expect(book.match({ ...candidate, target: { asset_id: 'conv-other' } })).toBeNull();
    expect(book.match({ ...candidate, risk: { level: 2, reasons: [] } })).toBeNull();
    expect(book.match({ ...candidate, amend: { ...candidate.amend!, unit: 'm/s' } })).toBeNull();
    expect(book.match({ ...candidate, is_drill: true })).toBeNull();
    now += 8 * 3600 * 1000; expect(book.match(candidate)).toBeNull(); expect(book.status('conveyor-under-5')).toBe('expired');
    book.revoke('conveyor-under-5'); expect(book.status('conveyor-under-5')).toBe('revoked'); expect(book.match(candidate)).toBeNull();
  });
});

describe('geometry and opaque colour roles', () => {
  it('rejects a small, side-shifted or remote desk even when the nearest edge is close', () => {
    const full = [[-0.6, -0.8], [0.6, -0.8], [0.6, 0], [-0.6, 0]] as const;
    expect(Placement.fits(full, Layout.HEAD)).toBe(true);
    expect(Placement.fits([[-0.1, -0.2], [0.1, -0.2], [0.1, 0], [-0.1, 0]], Layout.HEAD)).toBe(false);
    expect(Placement.fits(full.map(([x, z]) => [x + 0.5, z]), Layout.HEAD)).toBe(false);
    expect(Placement.fits(full, [0, 0.75, 0.5])).toBe(false);
    const card = Placement.panel(0.28, 0.245, 0.565, 2.5), settings = Placement.panel(0.28, 0.26, 0.54);
    for (const panel of [card, settings]) { expect(panel.reach).toBeLessThanOrEqual(0.61); expect(panel.horizontal).toBeLessThan(20); expect(panel.vertical).toBeLessThan(15); }
  });
  it('keeps all semantic text and focus/boundary pairings above their contrast thresholds', () => {
    const luminance = (hex: string) => {
      const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    for (const theme of Object.values(tokens.theme)) {
      for (const bg of [theme.canvas, theme.surface]) {
        for (const text of [theme.text, theme.muted, theme.accent, theme.warning, theme.danger]) expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
        for (const boundary of [theme.border, theme.focus]) expect(contrast(boundary, bg)).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(theme['on-control'], theme.control)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
