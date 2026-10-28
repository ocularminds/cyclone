import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntentHasher } from '../../app/src/core/hash';
import { Attestor } from '../src/attest';
import { Config } from '../src/config';
import type { Relay } from '../src/server';
import { AGENT, FakeClock, MockGate, SESSION, TENANT, attestKey, config, decide, handoff, hold, live, relay } from './rig';

const open: Relay[] = [];
async function make(cfg: Parameters<typeof relay>[0], gate?: MockGate): Promise<Relay> {
  const r = await relay(cfg, gate);
  open.push(r);
  return r;
}
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

async function socket(r: Relay, session = SESSION) {
  const msgs: Array<{ type: string; intent_id?: string; intent?: { intent_id: string }; record?: { record_id: string } }> = [];
  const ws = await r.app.injectWS(`/ws?session=${encodeURIComponent(session)}`, {}, {
    onInit: (sock) => sock.on('message', (d) => msgs.push(JSON.parse(String(d)))),
  });
  return { ws, msgs };
}

describe('relay: capabilities and auth (C35)', () => {
  it('advertises amended approval only when configured (default false, D20a)', async () => {
    const clock = new FakeClock();
    const off = await make(config(clock));
    expect((await off.app.inject({ method: 'GET', url: '/capabilities' })).json()).toEqual({ supportsAmendedApproval: false, source: 'live' });
    const on = await make(config(clock, { amendedApproval: true }));
    expect((await on.app.inject({ method: 'GET', url: '/capabilities' })).json()).toEqual({ supportsAmendedApproval: true, source: 'live' });
  });

  it('decisions need an operator session; handoffs need the agent token', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    const intent = await hold(r, await handoff('conveyor', clock));
    const veto = { decision: 'REJECT', gesture: 'veto_push', reason: { code: 'user_veto' } };
    for (const token of ['', 'nope']) {
      const res = await decide(r, intent, veto, token);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    }
    expect((await decide(r, intent, veto, AGENT)).statusCode).toBe(403);
    const h = await handoff('arm', clock);
    expect((await r.app.inject({ method: 'POST', url: '/held', payload: h })).statusCode).toBe(401);
    expect((await r.app.inject({ method: 'POST', url: '/held', headers: { authorization: `Bearer ${SESSION}` }, payload: h })).statusCode).toBe(403);
    await expect(r.app.injectWS('/ws?session=nope')).rejects.toThrow();
  });
});

describe('relay: held intents from the agent handoff', () => {
  it('maps the four demo intents onto the desk with the Cyclone policy mapping', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    const conveyor = await hold(r, await handoff('conveyor', clock));
    const arm = await hold(r, await handoff('arm', clock));
    const oven = await hold(r, await handoff('oven', clock, 'BLOCK', { dossier_id: 'synthetic-dossier-block-001' }));
    const lift = await hold(r, await handoff('drill-lift', clock));
    expect([conveyor, arm, oven, lift].map((i) => [i.tool, i.policy.rule_id, i.policy.requires, i.risk.level])).toEqual([
      ['set_conveyor_speed', 'conveyor.speed.small_change', 'single', 0],
      ['set_arm_velocity', 'arm.velocity.walkway_adjacent', 'two_hand', 2],
      ['set_oven_setpoint', 'oven.setpoint.hard_limit', 'forbidden', 3],
      ['lift_pallet', 'lift.routine', 'single', 0],
    ]);
    expect(arm.amend).toMatchObject({ param: 'deg_s', safe_max: 180 });
    expect(oven.amend).toBeUndefined();
    expect(lift.is_drill).toBe(true);
    expect(conveyor.agent).toEqual({ id: 'line-agent', label: 'Line Agent' });
    expect(arm.target.asset_id).toBe('arm-cell-3');
    expect(arm.args).toEqual({ cell: 3, joint: 'axis_3', deg_s: 250 });
    expect((await IntentHasher.hash(arm.binding)).intent_hash).toBe(arm.intent_hash);
  });

  it('refuses a handoff whose hash is not the binding’s, an ALLOW, an expired intent, another tenant, and conflicting payloads', async () => {
    const clock = new FakeClock();
    const r = await make(live(clock));
    const post = (payload: object) => r.app.inject({ method: 'POST', url: '/held', headers: { authorization: `Bearer ${AGENT}` }, payload });
    const h = await handoff('arm', clock);
    expect((await post({ ...h, intent_hash: `sha256:${'0'.repeat(64)}` })).statusCode).toBe(409);
    expect((await post({ ...h, authority: { status: 'ALLOW' } })).json()).toMatchObject({ code: 'NOT_HELD' });
    expect((await post({ binding: 'x' })).statusCode).toBe(400);
    const other = await handoff('arm', clock);
    other.binding.tenant_id = '00000000-0000-4000-8000-000000000000';
    other.intent_hash = (await IntentHasher.hash(other.binding)).intent_hash;
    expect((await post(other)).statusCode).toBe(403);
    const stale = await handoff('arm', clock);
    clock.advance(600);
    expect((await post(stale)).statusCode).toBe(410);
    const first = await handoff('conveyor', clock);
    await hold(r, first);
    const swapped = { ...first, binding: { ...first.binding, action: { ...first.binding.action, parameters: { line: 1, speed_pct: 9 } } } };
    swapped.intent_hash = (await IntentHasher.hash(swapped.binding)).intent_hash;
    expect((await post(swapped)).statusCode).toBe(409);
    expect(r.store.get(first.binding.intent_id)?.state).toBe('withdrawn');
  });
});

describe('relay: client decisions (C05–C09, C12, C13, C29)', () => {
  it('hash mismatch → 409, unknown → 404, expired → 410; the intent stays held', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    const intent = await hold(r, await handoff('conveyor', clock));
    const res = await decide(r, intent, { decision: 'REJECT', gesture: 'veto_push', intent_hash: `sha256:${'1'.repeat(64)}` });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'HASH_MISMATCH' });
    expect((await decide(r, { ...intent, intent_id: 'missing' }, { decision: 'REJECT', gesture: 'veto_push' })).statusCode).toBe(404);
    clock.advance(300);
    const late = await decide(r, intent, { decision: 'APPROVE', gesture: 'place' });
    expect(late.statusCode).toBe(410);
    expect(late.json()).toMatchObject({ code: 'EXPIRED' });
    expect(r.store.get(intent.intent_id)?.state).toBe('held');
  });

  it('veto without credentials seals an unverified live record; re-POST is idempotent', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    const intent = await hold(r, await handoff('conveyor', clock));
    const body = { decision: 'REJECT', gesture: 'veto_push', reason: { code: 'user_veto' } };
    const first = await decide(r, intent, body);
    expect(first.statusCode).toBe(200);
    const rec = first.json();
    expect(rec).toMatchObject({ intent_id: intent.intent_id, intent_hash: intent.intent_hash, source: 'live', tool: 'set_conveyor_speed', asset_id: 'conv-1' });
    expect(rec.verification).toMatchObject({ verified: false, trust_anchor: 'UNAVAILABLE' });
    expect(rec.relay.path).toBe('lapse');
    expect(rec.rehearsal.path_samples_ref).toMatch(/^rehearsal:[0-9a-f]{16}$/);
    const again = await decide(r, intent, body);
    expect(again.json().record_id).toBe(rec.record_id);
    expect((await decide(r, intent, { decision: 'ESCALATE', gesture: 'escalate_place' })).statusCode).toBe(409);
  });

  it('approval needs live credentials (503 until H1) and the right gesture (403)', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    const arm = await hold(r, await handoff('arm', clock));
    const none = await decide(r, arm, { decision: 'APPROVE', gesture: 'two_hand_hold' });
    expect(none.statusCode).toBe(503);
    expect(none.json()).toMatchObject({ code: 'UNAVAILABLE' });
    const wrong = await decide(r, arm, { decision: 'APPROVE', gesture: 'place' });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().code).toBe('FORBIDDEN');
    expect(r.store.get(arm.intent_id)?.state).toBe('held');
  });

  it('forbidden: the slot never approves; veto and escalate still work (C08)', async () => {
    const clock = new FakeClock();
    const gate = new MockGate();
    const r = await make(live(clock), gate);
    const oven = await hold(r, await handoff('oven', clock, 'BLOCK', { dossier_id: 'synthetic-dossier-block-001' }));
    const res = await decide(r, oven, { decision: 'APPROVE', gesture: 'place' });
    expect(res.statusCode).toBe(403);
    expect(gate.grants()).toHaveLength(0);
    expect((await decide(r, oven, { decision: 'ESCALATE', gesture: 'escalate_place' })).statusCode).toBe(200);
    const veto = await decide(r, oven, { decision: 'REJECT', gesture: 'veto_push', reason: { code: 'user_veto' } });
    expect(veto.statusCode).toBe(200);
    expect(veto.json().dossier.dossier_id).toBe('synthetic-dossier-block-001');
  });

  it('approve re-presents the intent with a presence attestation (docs §2b), fetches and verifies the dossier, broadcasts', async () => {
    const clock = new FakeClock();
    const gate = new MockGate();
    const r = await make(live(clock), gate);
    const { msgs } = await socket(r);
    const arm = await hold(r, await handoff('arm', clock));
    const res = await decide(r, arm, { decision: 'APPROVE', gesture: 'two_hand_hold' });
    expect(res.statusCode).toBe(200);
    const [grant] = gate.grants();
    expect(grant.headers['idempotency-key']).toBe(arm.intent_id);
    expect(grant.headers.authorization).toBe('Bearer dcy_org_test');
    expect(grant.body).toMatchObject({ ...arm.binding, intent_hash: arm.intent_hash, mode: 'ENFORCEMENT' });
    const ev = grant.body.evidence.humanApproval;
    expect(ev.provider).toBe('attestation');
    const opened = Attestor.open(ev.attestation, attestKey.publicJwk)!;
    expect(opened.header).toEqual({ alg: 'EdDSA', typ: 'decionis-presence-attestation+jwt', kid: 'cyclone-test-1' });
    expect(opened.claims).toMatchObject({
      aud: TENANT,
      sub: 'operator-1',
      intent_id: arm.intent_id,
      intent_hash: arm.intent_hash,
      presence: { method: 'two_hand_hold', result: 'VERIFIED', approver_role: 'CYCLONE_OPERATOR' },
    });
    expect(opened.claims.exp - opened.claims.iat).toBeLessThanOrEqual(300);
    expect(gate.seen.some((s) => s.url.includes('/v1/protocol/dossiers/synthetic-dossier-allow-001?org_id='))).toBe(true);
    const rec = res.json();
    expect(rec.dossier.dossier_id).toBe('synthetic-dossier-allow-001');
    // corpus key from a local file: signatures fine, anchor not official → unverified seal
    expect(rec.verification).toMatchObject({ verified: false, required_artifact_coverage_verified: true, trust_anchor: 'UNESTABLISHED' });
    await vi.waitFor(() => expect(msgs.map((m) => m.type)).toEqual(['intent.held', 'record.sealed', 'intent.resolved']));
    expect((await decide(r, arm, { decision: 'APPROVE', gesture: 'two_hand_hold' })).json().record_id).toBe(rec.record_id);
    expect(gate.grants()).toHaveLength(1);
  });

  it('a dossier signed by the key served at the pinned JWKS URL seals as verified', async () => {
    const clock = new FakeClock();
    const gate = new MockGate();
    const r = await make(live(clock, { jwks: { url: Config.PINNED_JWKS, file: null } }), gate);
    const conveyor = await hold(r, await handoff('conveyor', clock));
    const rec = (await decide(r, conveyor, { decision: 'APPROVE', gesture: 'place' })).json();
    expect(rec.verification).toMatchObject({ verified: true, required_artifact_coverage_verified: true, trust_anchor: 'DECIONIS_OFFICIAL' });
  });

  it('a policy gate that does not ALLOW, or refuses the attestation, leaves the intent held', async () => {
    const clock = new FakeClock();
    const gate = new MockGate();
    const r = await make(live(clock), gate);
    const arm = await hold(r, await handoff('arm', clock));
    gate.grantStatus = 'ESCALATE';
    const again = await decide(r, arm, { decision: 'APPROVE', gesture: 'two_hand_hold' });
    expect(again.statusCode).toBe(403);
    expect(r.store.get(arm.intent_id)?.state).toBe('held');
    gate.grantError = { status: 409, error: 'PRESENCE_ATTESTATION_INTENT_MISMATCH' };
    expect((await decide(r, arm, { decision: 'APPROVE', gesture: 'two_hand_hold' })).json().code).toBe('HASH_MISMATCH');
    gate.grantError = { status: 409, error: 'PRESENCE_ATTESTATION_KEY_UNKNOWN' };
    expect((await decide(r, arm, { decision: 'APPROVE', gesture: 'two_hand_hold' })).statusCode).toBe(503);
    gate.grantError = null;
    gate.grantStatus = 'BLOCK';
    expect((await decide(r, arm, { decision: 'APPROVE', gesture: 'two_hand_hold' })).statusCode).toBe(403);
    expect(r.store.get(arm.intent_id)?.intent?.policy.requires).toBe('forbidden');
    expect(r.store.get(arm.intent_id)?.state).toBe('held');
  });

  it('amended approval: unsupported by default; when enabled, hash-bound, ceiling-checked (422), then the undocumented stub (501)', async () => {
    const clock = new FakeClock();
    const off = await make(config(clock));
    const a0 = await hold(off, await handoff('arm', clock));
    const amend = async (r: Relay, intent: typeof a0, deg: number, hash?: string) => {
      const args = { ...intent.args, deg_s: deg };
      const amended_hash = hash ?? (await IntentHasher.hash(IntentHasher.amend(intent.binding!, args))).intent_hash;
      return decide(r, intent, { decision: 'APPROVE_AMENDED', gesture: 'two_hand_hold', amended_args: args, amended_hash });
    };
    expect((await amend(off, a0, 180)).json()).toMatchObject({ code: 'AMEND_UNSUPPORTED' });

    const on = await make(live(clock, { amendedApproval: true }), new MockGate());
    const arm = await hold(on, await handoff('arm', clock));
    expect((await amend(on, arm, 180, arm.intent_hash)).statusCode).toBe(409);
    const over = await amend(on, arm, 190);
    expect(over.statusCode).toBe(422);
    expect(over.json()).toMatchObject({ code: 'AMEND_DENIED' });
    expect(over.json().detail).toMatch(/ceiling is 180/);
    const within = await amend(on, arm, 180);
    expect(within.statusCode).toBe(501);
    expect(within.json()).toMatchObject({ code: 'AMEND_UNSUPPORTED' });
    expect(on.store.get(arm.intent_id)?.state).toBe('held');
  });

  it('counter-offer (C12 documented route): REJECT with a suggestion seals and keeps the suggestion', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    const arm = await hold(r, await handoff('arm', clock));
    const res = await decide(r, arm, { decision: 'REJECT', gesture: 'two_hand_hold', reason: { code: 'counter_offer', suggested: { deg_s: 180 } } });
    expect(res.statusCode).toBe(200);
    expect(res.json().decision.reason).toEqual({ code: 'counter_offer', suggested: { deg_s: 180 } });
  });

  it('escalate keeps the intent held (D5); a later veto resolves it; live veto cancels a managed escalation', async () => {
    const clock = new FakeClock();
    const gate = new MockGate();
    const r = await make(live(clock), gate);
    const { msgs } = await socket(r);
    const lift = await hold(r, await handoff('drill-lift', clock, 'ESCALATE', { escalation_id: 'esc-42' }));
    const esc = await decide(r, lift, { decision: 'ESCALATE', gesture: 'escalate_place' });
    expect(esc.statusCode).toBe(200);
    expect(esc.json().relay.path).toBe('local');
    expect(r.store.get(lift.intent_id)?.state).toBe('held');
    expect((await decide(r, lift, { decision: 'ESCALATE', gesture: 'escalate_place' })).json().record_id).toBe(esc.json().record_id);
    const veto = await decide(r, lift, { decision: 'REJECT', gesture: 'veto_push', reason: { code: 'user_veto' } });
    expect(veto.json().relay.path).toBe('escalation_cancelled');
    expect(gate.seen.some((s) => s.method === 'DELETE' && s.url.endsWith('/v1/authority/escalations/esc-42'))).toBe(true);
    await vi.waitFor(() => expect(msgs.map((m) => m.type)).toEqual(['intent.held', 'record.sealed', 'record.sealed', 'intent.resolved']));
  });

  it('desk rules never auto-approve in live mode (client falls back to a held token)', async () => {
    const clock = new FakeClock();
    const r = await make(live(clock), new MockGate());
    const conveyor = await hold(r, await handoff('conveyor', clock));
    const res = await decide(r, conveyor, { decision: 'AUTO_APPROVE_RULE', gesture: 'rule' });
    expect(res.statusCode).toBe(403);
    expect(r.store.get(conveyor.intent_id)?.state).toBe('held');
  });

  it('expiry fails closed: sweep seals REJECT(expired), broadcasts, and the client’s timeout veto gets the same record', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    const { msgs } = await socket(r);
    const intent = await hold(r, await handoff('conveyor', clock));
    expect(await r.resolver.sweep()).toBe(0);
    clock.advance(241);
    expect(await r.resolver.sweep()).toBe(1);
    await vi.waitFor(() => expect(msgs.map((m) => m.type)).toEqual(['intent.held', 'intent.expired', 'record.sealed', 'intent.resolved']));
    const sealed = r.store.get(intent.intent_id)!.final!;
    expect(sealed.decision).toMatchObject({ decision: 'REJECT', reason: { code: 'expired' }, gesture: 'timeout' });
    const client = await decide(r, intent, { decision: 'REJECT', gesture: 'timeout', reason: { code: 'expired' } });
    expect(client.json().record_id).toBe(sealed.record_id);
    expect((await decide(r, intent, { decision: 'APPROVE', gesture: 'place' })).statusCode).toBe(409);
  });

  it('a reconnecting headset gets what is held; records and idempotency survive a relay restart', async () => {
    const clock = new FakeClock();
    const dataDir = mkdtempSync(join(tmpdir(), 'cyclone-relay-'));
    const a = await make(config(clock, { dataDir }));
    const kept = await hold(a, await handoff('arm', clock));
    const gone = await hold(a, await handoff('conveyor', clock));
    const rec = (await decide(a, gone, { decision: 'REJECT', gesture: 'veto_push', reason: { code: 'user_veto' } })).json();
    await a.close();
    open.splice(open.indexOf(a), 1);
    const b = await make(config(clock, { dataDir }));
    const { msgs } = await socket(b);
    await vi.waitFor(() => expect(msgs).toHaveLength(1));
    expect(msgs[0]).toMatchObject({ type: 'intent.held', intent: { intent_id: kept.intent_id } });
    const again = await decide(b, gone, { decision: 'REJECT', gesture: 'veto_push', reason: { code: 'user_veto' } });
    expect(again.json().record_id).toBe(rec.record_id);
  });
});
