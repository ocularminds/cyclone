import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Config } from '../src/config';
import type { Relay } from '../src/server';
import { Store } from '../src/store';
import { FakeClock, MockGate, config, decide, handoff, hold, live, relay } from './rig';

const opened: Relay[] = [];
afterEach(async () => { await Promise.all(opened.splice(0).map(r => r.close())); });
async function make(options = {}) {
  const clock = new FakeClock(), gate = new MockGate();
  const r = await relay(live(clock, { jwks: { url: Config.PINNED_JWKS, file: null }, ...options }), gate);
  opened.push(r);
  const intent = await hold(r, await handoff('conveyor', clock));
  return { r, gate, intent, clock };
}

describe('revision1 authoritative decision regressions (mock service only)', () => {
  it('G07: refuses an unrelated valid dossier even with the mock pinned key source', async () => {
    const { r, intent } = await make();
    const record = (await decide(r, intent, { decision: 'APPROVE', gesture: 'place' })).json();
    expect(record.verification.verified).toBe(false);
    expect(record.verification.intent_binding_verified).toBe(false);
  });

  it('G08: retains the upstream authorization while failed proof is execution-ineligible', async () => {
    const { r, gate, intent } = await make(); gate.jwks = { keys: [] };
    const record = (await decide(r, intent, { decision: 'APPROVE', gesture: 'place' })).json();
    expect(record.authorization).toMatchObject({ status: 'approved', source: 'policy_gate' });
    expect(record.verification).toMatchObject({ verified: false, proof_status: 'unverified' });
    expect(record.execution).toMatchObject({ eligible: false, status: 'not_requested' });
    expect(r.store.get(intent.intent_id)?.state).toBe('resolved');
  });

  it('does not advertise an unimplemented amendment route when its obsolete flag is enabled', async () => {
    const clock = new FakeClock(); const r = await relay(config(clock, { amendedApproval: true })); opened.push(r);
    expect((await r.app.inject('/capabilities')).json().supportsAmendedApproval).toBe(false);
  });

  it('does not accept a different rejection as an idempotent duplicate', async () => {
    const { r, intent } = await make();
    await decide(r, intent, { decision: 'REJECT', gesture: 'veto_push', reason: { code: 'user_veto' } });
    const changed = await decide(r, intent, { decision: 'REJECT', gesture: 'timeout', reason: { code: 'expired' } });
    expect(changed.statusCode).toBe(409);
  });

  it('does not revive a legacy in-flight approval as held after restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cyclone-uncertain-'));
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ version: 1, entries: [{ intent_id: 'interrupted', state: 'deciding' }] }));
    expect(new Store(dir).get('interrupted')?.state).toBe('uncertain');
  });
  it('refuses disguised mutation fields before dispatching an original approval', async () => {
    const { r, gate, intent } = await make();
    expect((await decide(r, intent, { decision: 'APPROVE', gesture: 'place', amended_args: { speed_pct: 99 }, amended_hash: intent.intent_hash })).statusCode).toBe(400);
    expect((await decide(r, intent, { decision: 'APPROVE', gesture: 'place', reason: { code: 'expired' } })).statusCode).toBe(400);
    expect(gate.grants()).toHaveLength(0);
  });
});
