import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Relay } from '../src/server';
import { Webhook } from '../src/webhook';
import { FakeClock, MockGate, SESSION, config, decide, handoff, hold, relay, webhook } from './rig';

const open: Relay[] = [];
async function make(cfg: Parameters<typeof relay>[0], gate?: MockGate): Promise<Relay> {
  const r = await relay(cfg, gate);
  open.push(r);
  return r;
}
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

/** Documented field names (docs/agentsafe.md §1); the envelope itself is undocumented. */
function held(h: { binding: { intent_id: string; tenant_id: string; expires_at: string }; intent_hash: string }, extra: Record<string, unknown> = {}) {
  return {
    event_name: 'authority.escalation_required',
    tenant_id: h.binding.tenant_id,
    intent_id: h.binding.intent_id,
    intent_hash: h.intent_hash,
    expires_at: h.binding.expires_at,
    decision_id: 'dec-hook',
    dossier_id: 'synthetic-dossier-escalate-001',
    reason_codes: ['CYCLONE_TWO_HAND_APPROVAL'],
    ...extra,
  };
}

async function socket(r: Relay) {
  const msgs: Array<{ type: string; intent_id?: string }> = [];
  await r.app.injectWS(`/ws?session=${SESSION}`, {}, { onInit: (s) => s.on('message', (d) => msgs.push(JSON.parse(String(d)))) });
  return msgs;
}

describe('held-intent webhook (docs/agentsafe.md §1)', () => {
  it('verifies x-decionis-signature as HMAC-SHA256 of the raw body, hex or base64, with or without sha256=', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    const h = await handoff('arm', clock);
    expect((await webhook(r, held(h), 'hex')).statusCode).toBe(202);
    expect((await webhook(r, held(h), 'base64')).statusCode).toBe(202);
    const bad = await webhook(r, held(h), 'bad');
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect((await webhook(r, held(h), 'none')).statusCode).toBe(401);
    const raw = '{"a":1}';
    expect(Webhook.verify(raw, Webhook.sign(raw, 'k').toUpperCase(), 'k')).toBe(true);
    expect(Webhook.verify(raw, Webhook.sign(raw, 'k', 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=$/, ''), 'k')).toBe(true);
    expect(Webhook.verify(raw, Webhook.sign(raw, 'other'), 'k')).toBe(false);
  });

  it('refuses unsigned webhooks unless explicitly allowed (fail closed); optional Bearer is checked', async () => {
    const clock = new FakeClock();
    const h = await handoff('arm', clock);
    const strict = await make(config(clock, { webhook: { secret: null, bearer: null, allowUnsigned: false } }));
    expect((await webhook(strict, held(h), 'none')).statusCode).toBe(401);
    const dev = await make(config(clock, { webhook: { secret: null, bearer: 'hook-token', allowUnsigned: true } }));
    expect((await webhook(dev, held(h), 'none')).statusCode).toBe(401);
    expect((await webhook(dev, held(h), 'none', { authorization: 'Bearer hook-token' })).statusCode).toBe(202);
  });

  it('with RELAY_REQUIRE_WEBHOOK an ESCALATE reaches the desk only once handoff and webhook agree, in either order', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock, { requireWebhook: true }));
    const msgs = await socket(r);
    const post = (h: object) => r.app.inject({ method: 'POST', url: '/held', headers: { authorization: 'Bearer agent-token-1' }, payload: h });

    const a = await handoff('arm', clock);
    expect((await post(a)).json()).toMatchObject({ state: 'pending', presented: false });
    const res = await webhook(r, held(a));
    expect(res.json()).toMatchObject({ status: 'held' });
    const b = await handoff('conveyor', clock);
    expect((await webhook(r, held(b))).json()).toMatchObject({ status: 'pending' });
    expect((await post(b)).json()).toMatchObject({ state: 'held', presented: true });
    // BLOCK has no webhook (only ESCALATE does); it is presented from the handoff alone.
    expect((await post(await handoff('oven', clock, 'BLOCK'))).json()).toMatchObject({ presented: true });
    await vi.waitFor(() => expect(msgs.filter((m) => m.type === 'intent.held')).toHaveLength(3));
  });

  it('a webhook whose hash differs from the held payload withdraws the intent (fail closed)', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    const msgs = await socket(r);
    const h = await handoff('arm', clock);
    const intent = await hold(r, h);
    const res = await webhook(r, held(h, { intent_hash: `sha256:${'a'.repeat(64)}` }));
    expect(res.json()).toMatchObject({ status: 'conflict' });
    expect(r.store.get(intent.intent_id)?.state).toBe('withdrawn');
    await vi.waitFor(() => expect(msgs.map((m) => m.type)).toEqual(['intent.held', 'intent.expired']));
    expect((await decide(r, intent, { decision: 'REJECT', gesture: 'veto_push' })).statusCode).toBe(410);
  });

  it('escalation_resolved elsewhere takes the token off the desk; envelope under data + x-decionis-event header works', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    const h = await handoff('drill-lift', clock);
    const intent = await hold(r, h);
    const body = { data: { ...held(h), event_name: undefined, outcome: 'ALLOW', evidence: { kind: 'presence' } } };
    const res = await webhook(r, body, 'hex', { 'x-decionis-event': 'authority.escalation_resolved' });
    expect(res.json()).toMatchObject({ status: 'withdrawn' });
    expect(r.store.get(intent.intent_id)?.state).toBe('withdrawn');
  });

  it('webhook dossier_id and escalation_id fill a hold the agent did not know them for', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    const h = await handoff('arm', clock, 'ESCALATE', { dossier_id: undefined, decision_id: undefined });
    await hold(r, h);
    await webhook(r, held(h, { escalation_id: 'esc-7' }));
    expect(r.store.get(h.binding.intent_id)?.hold).toMatchObject({ dossier_id: 'synthetic-dossier-escalate-001', escalation_id: 'esc-7' });
  });

  it('ignores other events with 202 and rejects malformed payloads with 400', async () => {
    const clock = new FakeClock();
    const r = await make(config(clock));
    expect((await webhook(r, { event_name: 'decisioning.v2.ran', anything: 1 })).json()).toMatchObject({ status: 'ignored' });
    expect((await webhook(r, { event_name: 'authority.escalation_required', intent_id: 'x', intent_hash: 'nope' })).statusCode).toBe(400);
    expect((await webhook(r, { hello: 'world' })).statusCode).toBe(400);
  });
});
