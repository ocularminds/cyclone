import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveAdapter } from '../src/adapters/live';
import type { SignedRecord } from '../src/contracts/intent';
import type { ScenarioFile } from '../src/contracts/scenario';
import { Shift } from '../src/flow/shift';
import { Receipt } from '../src/core/receipt';
import { Ledger } from '../src/state/ledger';
import { Rig } from './rig';
import onboarding from '../src/scenario/onboarding.json';

class Socket {
  static current: Socket;
  onmessage?: (event: { data: string }) => void;
  constructor() { Socket.current = this; }
  close() {}
  emit(record: SignedRecord) { this.onmessage?.({ data: JSON.stringify({ type: 'record.sealed', record }) }); }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup() {
  const rig = new Rig({ ...onboarding, beats: [{ template: 'conveyor', beat: 'one', at: 0 }] } as ScenarioFile);
  await rig.start(); const token = await rig.next('set_conveyor_speed');
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(token.intent.binding!.captured_at));
  const live = new LiveAdapter('https://mock.relay', 'mock-session', rig.store);
  const shift = new Shift(live, rig.rehearsal, rig.clock, rig.settings, rig.ledger, rig.trust, rig.calibration, rig.log, () => token.deadlineMs);
  vi.stubGlobal('WebSocket', Socket);
  const decision = { intent_id: token.id, decision: 'APPROVE' as const, intent_hash: token.intent.intent_hash, gesture: 'place' as const, client_ts: '' };
  const record: SignedRecord = { record_id: 'mock-record', intent_id: token.id, decision, intent_hash: token.intent.intent_hash,
    source: 'live', tool: token.intent.tool, asset_id: token.intent.target.asset_id, decided_at: token.intent.binding!.captured_at,
    rehearsal: { args: token.args, path_samples_ref: 'rehearsal:unavailable' }, revision: 1,
    authorization: { status: 'approved', source: 'policy_gate', decision_id: 'mock-decision', dossier_id: 'mock-dossier' },
    execution: { eligible: false, status: 'not_requested', reason: 'No actuator configured' },
    verification: { verified: false, required_artifact_coverage_verified: false, trust_anchor: 'UNKNOWN', issuer_tier: 'unknown', assurance_scope_summary: 'Mock: awaiting proof', checked_at: '', proof_status: 'pending' } };
  return { rig, live, shift, record, token };
}
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('headset recovery and socket ordering (mock relay)', () => {
  it('converges HTTP and reordered socket updates into one receipt and one summary event', async () => {
    const { rig, live, shift, record, token } = await setup();
    const newer = { ...record, revision: 2, verification: { ...record.verification, proof_status: 'unverified' } } as SignedRecord;
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/capabilities')) return response({ supportsAmendedApproval: false });
      if (url.endsWith('/decision')) { Socket.current.emit(newer); Socket.current.emit(record); return response(record); }
      return response({});
    }));
    await live.connect(); await shift.receive(token.intent);
    const sealed = vi.fn(), update = vi.fn(); shift.events.on('sealed', sealed); shift.events.on('record', update);
    const result = await shift.decide(token.id, 'APPROVE', 'place');
    expect(result?.revision).toBe(2); expect(rig.ledger.all()).toHaveLength(1); expect(sealed).toHaveBeenCalledTimes(1);
    expect(rig.log.summary().decisions).toBe(1); expect(shift.get(token.id)?.status).toBe('sealed');
    expect(await Receipt.check(result!)).toBe(true); expect(calls.filter(p => p.endsWith('/decision'))).toHaveLength(1);
    Socket.current.emit({ ...newer, revision: 3 }); expect(rig.ledger.all()[0].revision).toBe(3);
    expect(update).toHaveBeenCalledTimes(1); expect(rig.log.summary().decisions).toBe(1);
    expect(new Ledger(rig.store).all()[0].local_rehearsal).toEqual(result!.local_rehearsal);
    live.disconnect(); shift.dispose();
  });
  it('keeps an unknown sent decision disabled, restores reviewed evidence on reload, and only rechecks', async () => {
    const { rig, live, shift, record, token } = await setup(); const calls: string[] = [];
    const unknown = { ...record, authorization: { status: 'unknown', source: 'relay' } } as SignedRecord;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/capabilities')) return response({});
      if (url.endsWith('/decision')) throw Error('Mock network response lost');
      if (url.endsWith('/record')) return response(unknown);
      if (url.endsWith('/verification')) return response({ ...record, revision: 2 });
      return response({});
    }));
    await live.connect(); await shift.receive(token.intent); await shift.decide(token.id, 'APPROVE', 'place');
    expect(shift.get(token.id)?.status).toBe('unverified'); expect(rig.log.summary().decisions).toBe(0);
    expect(await shift.decide(token.id, 'APPROVE', 'place')).toBeNull();
    const reloaded = new LiveAdapter('https://mock.relay', 'mock-session', rig.store);
    const recovered = await reloaded.recover(token.id); expect(await Receipt.check(recovered)).toBe(true);
    await shift.recoverRecord(token.id);
    expect(shift.get(token.id)?.status).toBe('sealed'); expect(rig.ledger.all()).toHaveLength(1); expect(rig.log.summary().decisions).toBe(1);
    expect(calls.filter(p => p.endsWith('/decision'))).toHaveLength(1);
    live.disconnect(); shift.dispose();
  });
  it('does not re-enable a decision when its successful response is malformed or completely lost', async () => {
    const { live, shift, token } = await setup();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/capabilities') ? response({}) : new Response('broken response')));
    await live.connect(); await shift.receive(token.intent);
    expect(await shift.decide(token.id, 'APPROVE', 'place')).toBeNull(); expect(shift.get(token.id)?.status).toBe('unverified');
    expect(await shift.decide(token.id, 'APPROVE', 'place')).toBeNull(); live.disconnect(); shift.dispose();
  });
  it('does not grant live automatic authority even with an accepted matching demo rule', async () => {
    const { rig, live, shift, token } = await setup();
    for (let i = 0; i < 3; i++) rig.trust.record(token.intent, 'clean');
    rig.trust.accept('conveyor-under-5', 'line-agent');
    const spy = vi.spyOn(live, 'resolve');
    expect((await shift.receive(token.intent)).status).toBe('held'); expect(spy).not.toHaveBeenCalled();
    expect(shift.acceptRule('conveyor-under-5', 'line-agent')).toBe(false); shift.dispose();
  });
});
