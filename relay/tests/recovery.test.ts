import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Config } from '../src/config';
import type { Relay } from '../src/server';
import { Store } from '../src/store';
import { SyntheticProof } from './proof';
import { FakeClock, MockGate, SESSION, decide, handoff, hold, live, relay, webhook } from './rig';

const opened: Relay[] = [];
afterEach(async () => { await Promise.all(opened.splice(0).map(r => r.close())); });
async function make(dataDir: string | null = null) {
  const clock = new FakeClock(), gate = new MockGate(), proof = new SyntheticProof();
  gate.sign = b => proof.create(b); gate.jwks = proof.jwks;
  const cfg = live(clock, { dataDir, jwks: { file: null, url: Config.PINNED_JWKS } });
  const r = await relay(cfg, gate); opened.push(r);
  const intent = await hold(r, await handoff('conveyor', clock));
  return { r, gate, clock, intent, cfg, proof };
}
const approve = { decision: 'APPROVE', gesture: 'place' };
const check = (r: Relay, id: string, session = SESSION) => r.app.inject({
  method: 'POST', url: `/intents/${id}/verification`, headers: { authorization: `Bearer ${session}` },
});

describe('record recovery (ephemeral mock issuer, never live evidence)', () => {
  it('rechecks the same record after missing keys, without another grant or execution call', async () => {
    const { r, gate, intent, proof } = await make(); gate.jwks = { keys: [] };
    const before = (await decide(r, intent, approve)).json();
    expect(before.authorization.status).toBe('approved'); expect(before.verification.verified).toBe(false);
    gate.jwks = proof.jwks;
    const after = (await check(r, intent.intent_id)).json();
    expect(after.record_id).toBe(before.record_id); expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.decision).toEqual(before.decision); expect(after.verification.verified).toBe(true);
    expect(after.execution).toMatchObject({ eligible: false, status: 'not_requested' });
    expect(gate.grants()).toHaveLength(1);
    expect(gate.seen.filter(x => x.method !== 'GET')).toHaveLength(1);
    expect((await check(r, intent.intent_id, 'wrong')).statusCode).toBe(401);
    expect((await r.app.inject(`/intents/${intent.intent_id}/record`)).statusCode).toBe(401);
  });
  it('retains approval through unavailable dossiers, expiry, duplicate submissions and relay restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cyclone-proof-recovery-'));
    const { r, gate, intent, clock, cfg } = await make(dir); gate.dossierStatus = 503;
    const [a, b] = await Promise.all([decide(r, intent, approve), decide(r, intent, approve)]);
    const before = a.json(); expect(b.json().record_id).toBe(before.record_id); expect(gate.grants()).toHaveLength(1);
    await r.close(); opened.splice(opened.indexOf(r), 1);
    clock.advance(241); gate.dossierStatus = 200;
    const restarted = await relay(cfg, gate); opened.push(restarted);
    expect(restarted.store.held()).toHaveLength(0);
    expect((await decide(restarted, intent, approve)).json().record_id).toBe(before.record_id);
    const after = (await check(restarted, intent.intent_id)).json();
    expect(after.authorization.status).toBe('approved'); expect(after.verification.verified).toBe(true);
    expect(after.record_id).toBe(before.record_id); expect(gate.grants()).toHaveLength(1);
    expect((await decide(restarted, intent, { decision: 'REJECT', gesture: 'veto_push', reason: { code: 'user_veto' } })).statusCode).toBe(409);
  });
  it('makes approved/pending proof readable and durable before dossier fetch completes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cyclone-pending-proof-'));
    const { r, gate, intent } = await make(dir);
    let entered = false, release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    gate.dossierWait = async () => { entered = true; await waiting; };
    const pending = decide(r, intent, approve).then(response => response.json());
    await vi.waitFor(() => expect(entered).toBe(true));
    const response = await r.app.inject({ url: `/intents/${intent.intent_id}/record`, headers: { authorization: `Bearer ${SESSION}` } });
    expect(response.json().authorization.status).toBe('approved');
    expect(response.json().verification.proof_status).toBe('pending');
    expect(new Store(dir).get(intent.intent_id)?.final?.record_id).toBe(response.json().record_id);
    expect(new Store(dir).held()).toHaveLength(0);
    release(); expect((await pending).record_id).toBe(response.json().record_id);
  });
  it('a lost grant response stays unknown, then reconciles only a matching authenticated webhook and proof', async () => {
    const { r, gate, intent } = await make(); gate.loseGrantResponse = true;
    const record = (await decide(r, intent, approve)).json();
    expect(record.authorization.status).toBe('unknown'); expect(r.store.get(intent.intent_id)?.state).toBe('uncertain');
    expect((await decide(r, intent, approve)).json().record_id).toBe(record.record_id); expect(gate.grants()).toHaveLength(1);
    expect((await check(r, intent.intent_id)).json().authorization.status).toBe('unknown');
    const dossier = [...gate.dossiers.values()].find(d => d.routing_decision && (d.routing_decision as any).decision_id === `dec-${intent.intent_id}`)!;
    const event = { name: undefined, event: 'authority.escalation_resolved', intent_id: intent.intent_id,
      intent_hash: intent.intent_hash, outcome: 'ALLOW', decision_id: `dec-${intent.intent_id}`, dossier_id: dossier.dossier_id };
    await webhook(r, { ...event, intent_hash: 'sha256:' + 'f'.repeat(64) });
    expect((await check(r, intent.intent_id)).json().authorization.status).toBe('unknown');
    await webhook(r, event);
    // An older repeated hold must not erase the resolved event used for recovery.
    await webhook(r, { event: 'authority.escalation_required', intent_id: intent.intent_id, intent_hash: intent.intent_hash });
    const after = (await check(r, intent.intent_id)).json();
    expect(after.record_id).toBe(record.record_id); expect(after.authorization.status).toBe('approved');
    expect(after.verification.verified).toBe(true); expect(gate.grants()).toHaveLength(1);
  });
  it('preserves a corrupt authority store and refuses startup instead of forgetting dispatched requests', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cyclone-corrupt-store-')), path = join(dir, 'state.json');
    writeFileSync(path, '{"version":2,"entries":[');
    expect(() => new Store(dir)).toThrow(/Restore or reconcile/);
    expect(readFileSync(path, 'utf8')).toBe('{"version":2,"entries":[');
  });
});
