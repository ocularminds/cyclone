import { bindingFailure, intentHash } from '@decionis/verify';
import { afterEach, describe, expect, it } from 'vitest';
import { Proposer } from '../../agent/src/propose';
import type { Relay } from '../src/server';
import { AGENT, FakeClock, MockGate, TENANT, live, relay } from './rig';

const open: Relay[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

describe('scripted agent (C36, docs/agentsafe.md §3a)', () => {
  it('dry run: the four onboarding calls, each a documented grants request bound to its Intent v1 hash', async () => {
    const lines: string[] = [];
    const p = new Proposer({ apiBase: 'https://api.decionis.com', apiKey: null, orgId: null, relay: 'http://localhost:8787', agentToken: null, dry: true, out: (l) => lines.push(l) });
    const sent = await p.shift();
    expect(sent.map((s) => [s.call.template.tool, s.call.binding.action.resource])).toEqual([
      ['set_conveyor_speed', 'conv-1'],
      ['set_arm_velocity', 'arm-cell-3'],
      ['set_oven_setpoint', 'oven-b'],
      ['lift_pallet', 'lift-2'],
    ]);
    for (const { call } of sent) {
      const { intent_hash: stated, mode, ...binding } = call.request.body;
      expect(call.request.url).toBe('https://api.decionis.com/v1/authority/grants');
      expect(call.request.headers['idempotency-key']).toBe(call.binding.intent_id);
      expect(mode).toBe('ENFORCEMENT');
      expect(binding).toEqual(call.binding);
      expect(bindingFailure(binding)).toBeNull();
      expect(intentHash(binding).intent_hash).toBe(stated);
      expect(Date.parse(call.binding.expires_at) - Date.parse(call.binding.captured_at)).toBeLessThanOrEqual(300_000);
    }
    expect(lines.join('\n')).not.toMatch(/dcy_|Bearer [^<]/);
    expect(lines.filter((l) => l.includes('/held'))).toHaveLength(4);
  });

  it('live (mocked policy gate): held answers are handed to the relay, which puts them on the desk', async () => {
    const clock = new FakeClock();
    const gate = new MockGate();
    const r = await relay(live(clock), gate);
    open.push(r);
    const verdicts: Record<string, 'ESCALATE' | 'BLOCK' | 'ALLOW'> = {
      set_conveyor_speed: 'ESCALATE',
      set_arm_velocity: 'ESCALATE',
      set_oven_setpoint: 'BLOCK',
      lift_pallet: 'ESCALATE',
    };
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/held') {
        const res = await r.app.inject({ method: 'POST', url: '/held', headers: init?.headers as Record<string, string>, payload: String(init?.body) });
        return new Response(res.body, { status: res.statusCode });
      }
      gate.grantStatus = verdicts[JSON.parse(String(init?.body)).action.type];
      return gate.fetch(input, init);
    };
    const p = new Proposer({
      apiBase: 'https://api.decionis.com',
      apiKey: 'dcy_org_test',
      orgId: TENANT,
      relay: 'http://relay.test',
      agentToken: AGENT,
      dry: false,
      fetch: fetcher,
      now: clock.now,
      out: () => undefined,
    });
    const sent = await p.shift();
    expect(sent.every((s) => s.held)).toBe(true);
    expect(gate.grants().every((g) => g.headers.authorization === 'Bearer dcy_org_test' && !g.body.evidence)).toBe(true);
    const desk = r.store.held().map((e) => [e.intent!.tool, e.intent!.policy.requires, e.intent!.is_drill === true]);
    expect(desk).toEqual([
      ['set_conveyor_speed', 'single', false],
      ['set_arm_velocity', 'two_hand', false],
      ['set_oven_setpoint', 'forbidden', false],
      ['lift_pallet', 'single', true],
    ]);
  });

  it('re-proposes within the suggested limit after a counter-offer (scripted 180°/s template)', () => {
    const p = new Proposer({ apiBase: 'x', apiKey: null, orgId: null, relay: 'x', agentToken: null, dry: true });
    const arm = p.scenario.templates.find((t) => t.key === 'arm')!;
    expect(p.reproposal('arm', arm, { deg_s: 180 }).args).toEqual({ cell: 3, joint: 'axis_3', deg_s: 180 });
    const re = p.reproposal('conveyor', p.scenario.templates[0], { speed_pct: 5 });
    expect(re.args).toMatchObject({ speed_pct: 5 });
  });
});
