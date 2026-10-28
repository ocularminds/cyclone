import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HeldIntent, IntentBinding } from '../../app/src/contracts/intent';
import type { Cast, IntentTemplate, ScenarioFile } from '../../app/src/contracts/scenario';
import { Clock } from '../../app/src/core/clock';
import { IntentHasher } from '../../app/src/core/hash';
import { Rng } from '../../app/src/core/rng';
import { IntentFactory } from '../../app/src/scenario/factory';
import { Attestor } from '../src/attest';
import { Config, REPO_ROOT, RELAY_ROOT, type RelayConfig } from '../src/config';
import type { Handoff } from '../src/held';
import { Relay } from '../src/server';
import { Webhook } from '../src/webhook';

export const DOSSIERS = join(RELAY_ROOT, 'src/fixtures/dossiers');
export const CORPUS_JWKS = join(DOSSIERS, 'corpus-jwks.json');
export const TENANT = '6f1c2a7e-3b4d-4e5f-9a0b-1c2d3e4f5a6b';
export const SESSION = 'sess-operator-1';
export const AGENT = 'agent-token-1';
export const SECRET = 'whsec_cyclone_test';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
export const onboarding = json(join(REPO_ROOT, 'app/src/scenario/onboarding.json')) as ScenarioFile;
export const cast = json(join(REPO_ROOT, 'app/src/scenario/agents.json')) as Cast;

/** The corpus fixture file (`{ expected, dossier_payload, ... }`). */
export function fixture(name: string): { dossier_payload: Record<string, any>; expected: Record<string, unknown> } {
  return json(join(DOSSIERS, `${name}.json`));
}

export class FakeClock {
  t = Date.parse('2026-11-10T09:00:00.000Z');
  readonly now = () => this.t;
  advance(seconds: number): void {
    this.t += seconds * 1000;
  }
}

export function template(key: string): IntentTemplate {
  const t = onboarding.templates.find((x) => x.key === key);
  if (!t) throw new Error(key);
  return t;
}

let seed = 11;
/** A real Intent v1 binding for an onboarding template, built with the shared factory. */
export async function bind(key: string, clock: FakeClock, ttl_s = 240): Promise<{ binding: IntentBinding; intent_hash: string }> {
  const factory = new IntentFactory(cast, new Clock(clock.t), new Rng(seed++));
  const t = template(key);
  const binding = factory.binding(t, new Rng(seed++).uuid(), ttl_s);
  return { binding, intent_hash: (await IntentHasher.hash(binding)).intent_hash };
}

export async function handoff(
  key: string,
  clock: FakeClock,
  status: Handoff['authority']['status'] = 'ESCALATE',
  extra: Partial<Handoff['authority']> = {},
): Promise<Handoff> {
  const b = await bind(key, clock);
  const t = template(key);
  return {
    ...b,
    authority: { status, decision_id: `dec-${key}`, dossier_id: 'synthetic-dossier-escalate-001', reason_codes: ['TEST'], ...extra },
    presentation: { summary: t.summary, rationale: t.rationale, drill: t.is_drill === true },
  };
}

type Seen = { method: string; url: string; headers: Record<string, string>; body: any };

/**
 * Mock policy gate behind the injected fetch: grants, dossier fetch,
 * escalation cancel and the pinned JWKS. Nothing touches the network.
 */
export class MockGate {
  readonly seen: Seen[] = [];
  grantStatus: 'ALLOW' | 'ESCALATE' | 'BLOCK' = 'ALLOW';
  grantError: { status: number; error: string } | null = null;
  /** dossier_id → payload served by GET /v1/protocol/dossiers/{id}. */
  readonly dossiers = new Map<string, Record<string, unknown>>();
  jwks: unknown = json(CORPUS_JWKS);

  constructor() {
    for (const name of ['allow', 'block', 'escalate']) {
      const p = fixture(name).dossier_payload;
      this.dossiers.set(p.dossier_id, p);
    }
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const method = init?.method ?? 'GET';
    this.seen.push({ method, url, headers, body });
    const u = new URL(url);
    const reply = (status: number, value: unknown) =>
      new Response(value === undefined ? null : JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/.well-known/decision-dossier-jwks.json') return reply(200, this.jwks);
    if (method === 'POST' && u.pathname === '/v1/authority/grants') {
      if (this.grantError) return reply(this.grantError.status, { error: this.grantError.error, message: 'refused', request_id: 'r1', status: this.grantError.status });
      const id = this.grantStatus === 'ALLOW' ? 'synthetic-dossier-allow-001' : this.grantStatus === 'BLOCK' ? 'synthetic-dossier-block-001' : 'synthetic-dossier-escalate-001';
      return reply(200, {
        decision_id: `dec-${body.intent_id}`,
        chain_id: 'chain-1',
        status: this.grantStatus,
        should_execute: this.grantStatus === 'ALLOW',
        execution_eligible: this.grantStatus === 'ALLOW',
        reason_codes: this.grantStatus === 'ALLOW' ? [] : ['HELD'],
        dossier_id: id,
      });
    }
    const m = /^\/v1\/protocol\/dossiers\/([^/]+)$/.exec(u.pathname);
    if (method === 'GET' && m) {
      const p = this.dossiers.get(decodeURIComponent(m[1]));
      return p ? reply(200, { service: 'protocol', protocol_version: '1.1', dossier: p }) : reply(404, { error: 'NOT_FOUND' });
    }
    if (method === 'DELETE' && u.pathname.startsWith('/v1/authority/escalations/')) return reply(200, { cancelled: true });
    return reply(404, { error: 'NOT_FOUND', message: url });
  };

  grants(): Seen[] {
    return this.seen.filter((s) => s.method === 'POST' && s.url.endsWith('/v1/authority/grants'));
  }
}

export const attestKey = Attestor.generate();

export function config(clock: FakeClock, over: Partial<RelayConfig> = {}): RelayConfig {
  return Config.defaults({
    sessions: [{ token: SESSION, subject: 'operator-1' }],
    agentToken: AGENT,
    webhook: { secret: SECRET, bearer: null, allowUnsigned: false },
    jwks: { url: Config.PINNED_JWKS, file: CORPUS_JWKS },
    now: clock.now,
    ...over,
  });
}

/** Credentials as if H1 were done (all mocked): org key, org id, attestation key. */
export function live(clock: FakeClock, over: Partial<RelayConfig> = {}): RelayConfig {
  return config(clock, {
    upstream: { base: 'https://api.decionis.com', apiKey: 'dcy_org_test', orgId: TENANT, reject: false, escalate: false },
    attest: { key: attestKey.privatePem, kid: 'cyclone-test-1', issuer: 'https://cyclone.example/attest', role: 'CYCLONE_OPERATOR', method: null },
    ...over,
  });
}

export async function relay(cfg: RelayConfig, gate?: MockGate): Promise<Relay> {
  return Relay.create(cfg, { fetch: gate?.fetch ?? (async () => new Response(null, { status: 599 })) });
}

/** POST /held as the agent; returns the HeldIntent the desk received. */
export async function hold(r: Relay, h: Handoff): Promise<HeldIntent> {
  const res = await r.app.inject({ method: 'POST', url: '/held', headers: { authorization: `Bearer ${AGENT}` }, payload: h });
  if (res.statusCode !== 200) throw new Error(`hold ${res.statusCode} ${res.body}`);
  const e = r.store.get(h.binding.intent_id);
  if (!e?.intent) throw new Error('not presented');
  return e.intent;
}

export function decide(r: Relay, intent: HeldIntent, body: Record<string, unknown>, token = SESSION) {
  return r.app.inject({
    method: 'POST',
    url: `/intents/${intent.intent_id}/decision`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: {
      intent_id: intent.intent_id,
      intent_hash: intent.intent_hash,
      client_ts: new Date().toISOString(),
      ...body,
    },
  });
}

export function webhook(r: Relay, body: unknown, sign: 'hex' | 'base64' | 'none' | 'bad' = 'hex', extra: Record<string, string> = {}) {
  const raw = JSON.stringify(body);
  const sig =
    sign === 'hex'
      ? Webhook.sign(raw, SECRET, 'hex')
      : sign === 'base64'
        ? `sha256=${Webhook.sign(raw, SECRET, 'base64')}`
        : sign === 'bad'
          ? Webhook.sign(`${raw} `, SECRET, 'hex')
          : undefined;
  return r.app.inject({
    method: 'POST',
    url: '/webhooks/policy-gate',
    headers: { 'content-type': 'application/json', ...(sig ? { 'x-decionis-signature': sig } : {}), ...extra },
    payload: raw,
  });
}
