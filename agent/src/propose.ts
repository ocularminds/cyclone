import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IntentBinding, SignedRecord } from '../../app/src/contracts/intent';
import type { Cast, IntentTemplate, ScenarioFile } from '../../app/src/contracts/scenario';
import { Clock } from '../../app/src/core/clock';
import { IntentHasher } from '../../app/src/core/hash';
import { Rng } from '../../app/src/core/rng';
import { IntentFactory } from '../../app/src/scenario/factory';
import type { Handoff } from '../../relay/src/held';
import { Upstream, type AuthorityDecision } from '../../relay/src/upstream';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Live intent ids and idempotency keys come from the OS CSPRNG, not the seeded demo PRNG. */
class CryptoRng extends Rng {
  override uuid(): string {
    return randomUUID();
  }
}

export type AgentOptions = {
  apiBase: string;
  apiKey: string | null;
  orgId: string | null;
  /** Relay base URL (http[s]://host:port). */
  relay: string;
  agentToken: string | null;
  dry: boolean;
  fetch?: typeof fetch;
  now?: () => number;
  out?: (line: string) => void;
  scenarioPath?: string;
  castPath?: string;
};

export type Call = {
  key: string;
  template: IntentTemplate;
  binding: IntentBinding;
  intent_hash: string;
  request: { method: 'POST'; url: string; headers: Record<string, string>; body: Record<string, unknown> };
};

export type Submitted = { call: Call; decision: AuthorityDecision | null; held: boolean };

/**
 * The scripted rule agent (C36): issues the onboarding tool calls through the
 * documented submission path, docs/agentsafe.md §3a (POST /v1/authority/grants
 * with the full Intent v1 binding + intent_hash, `Idempotency-Key` = intent_id,
 * Bearer org key), using the shared Intent v1 hash code. A held answer
 * (ESCALATE, or BLOCK for the forbidden oven) is handed to the relay on
 * POST /held, because the webhook carries the hash but not the binding (§1).
 */
export class Proposer {
  /** OAS ExecutionIntentBindingBase: expires_at ≤ 5 minutes after captured_at (docs/agentsafe.md Headline 2). */
  static readonly MAX_TTL_S = 300;
  readonly scenario: ScenarioFile;
  readonly cast: Cast;
  private readonly upstream: Upstream;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly out: (line: string) => void;

  constructor(private readonly opts: AgentOptions) {
    this.scenario = JSON.parse(readFileSync(opts.scenarioPath ?? resolve(REPO, 'app/src/scenario/onboarding.json'), 'utf8'));
    this.cast = JSON.parse(readFileSync(opts.castPath ?? resolve(REPO, 'app/src/scenario/agents.json'), 'utf8'));
    this.fetcher = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.upstream = new Upstream({ base: opts.apiBase, apiKey: opts.apiKey, orgId: opts.orgId, fetch: this.fetcher });
    this.now = opts.now ?? (() => Date.now());
    this.out = opts.out ?? ((line) => console.log(line));
  }

  /** The four demo calls, in beat order (conveyor, arm, oven, drill lift). */
  beats(): IntentTemplate[] {
    return this.scenario.beats.map((b) => {
      const t = this.scenario.templates.find((x) => x.key === b.template);
      if (!t) throw new Error(`Unknown template ${b.template}`);
      return t;
    });
  }

  async build(t: IntentTemplate): Promise<Call> {
    const cast: Cast = { ...this.cast, tenant_id: this.opts.orgId ?? this.cast.tenant_id };
    const factory = new IntentFactory(cast, new Clock(this.now()), new CryptoRng());
    const intentId = randomUUID();
    const base = factory.binding(t, intentId, Math.min(t.ttl_s, Proposer.MAX_TTL_S));
    // Live provenance; physical execution stays simulated (AGENTS §2 honesty).
    const binding: IntentBinding = {
      ...base,
      actor: { ...base.actor, runtime: 'cyclone-agent' },
      downstream_target: { ...base.downstream_target, environment: 'simulated' },
    };
    const { intent_hash } = await IntentHasher.hash(binding);
    return {
      key: t.key,
      template: t,
      binding,
      intent_hash,
      request: {
        method: 'POST',
        url: `${this.opts.apiBase.replace(/\/$/, '')}/v1/authority/grants`,
        headers: {
          authorization: 'Bearer <DECIONIS_API_KEY>',
          'idempotency-key': intentId,
          'content-type': 'application/json',
        },
        body: Upstream.grantBody(binding, intent_hash, { mode: 'ENFORCEMENT' }),
      },
    };
  }

  handoff(call: Call, decision: AuthorityDecision | null, supersedes?: string): Handoff {
    return {
      binding: call.binding,
      intent_hash: call.intent_hash,
      authority: {
        status: decision?.status ?? 'ESCALATE',
        decision_id: decision?.decision_id,
        dossier_id: decision?.dossier_id,
        escalation_id: decision?.managed_escalation?.escalation_id ?? null,
        reason_codes: decision?.reason_codes ?? [],
      },
      presentation: {
        summary: call.template.summary,
        rationale: call.template.rationale,
        drill: call.template.is_drill === true,
        ...(supersedes ? { supersedes } : {}),
      },
    };
  }

  /** Submit one call; on a hold, hand the binding to the relay. Dry run prints instead. */
  async submit(call: Call, supersedes?: string): Promise<Submitted> {
    if (this.opts.dry) {
      this.out(`# ${call.key}: ${call.template.tool} → ${call.binding.action.resource}`);
      this.out(JSON.stringify(call.request, null, 2));
      const h = this.handoff(call, null, supersedes);
      h.authority = { status: 'ESCALATE', reason_codes: ['<from the grants response>'] };
      this.out(`# then, if held: POST ${this.relayUrl('/held')} (Authorization: Bearer <RELAY_AGENT_TOKEN>)`);
      this.out(JSON.stringify(h, null, 2));
      return { call, decision: null, held: false };
    }
    // docs/agentsafe.md §3a
    const decision = await this.upstream.grant(call.binding, call.intent_hash, { mode: 'ENFORCEMENT' });
    this.out(`${call.key}: ${decision.status} (decision ${decision.decision_id}, dossier ${decision.dossier_id})`);
    if (decision.status === 'ALLOW') {
      this.out(`${call.key}: allowed by policy, not held (execution is simulated).`);
      return { call, decision, held: false };
    }
    if (!this.opts.agentToken) {
      this.out(`${call.key}: held, but RELAY_AGENT_TOKEN is not set; not handed to the relay.`);
      return { call, decision, held: false };
    }
    const res = await this.fetcher(this.relayUrl('/held'), {
      method: 'POST',
      headers: { authorization: `Bearer ${this.opts.agentToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(this.handoff(call, decision, supersedes)),
    });
    const body = await res.text();
    this.out(`${call.key}: relay ${res.status} ${body}`);
    return { call, decision, held: res.ok };
  }

  /** All four calls at once. */
  async shift(): Promise<Submitted[]> {
    const done: Submitted[] = [];
    for (const t of this.beats()) done.push(await this.submit(await this.build(t)));
    return done;
  }

  /**
   * Paced like the onboarding beats: each call waits for the previous one to be
   * decided on the desk. A counter-offer (REJECT with a suggestion, C12) gets a
   * re-proposal within the suggested limit: a new intent with a new hash.
   */
  async follow(): Promise<void> {
    const Socket = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (this.opts.dry || !Socket || !this.opts.agentToken) {
      this.out('follow: needs credentials, RELAY_AGENT_TOKEN and Node ≥ 22 (global WebSocket); skipped.');
      return;
    }
    const waiting = new Map<string, (r: SignedRecord | null) => void>();
    const ws = new Socket(`${this.relayUrl('/ws').replace(/^http/, 'ws')}?session=${encodeURIComponent(this.opts.agentToken)}`);
    await new Promise<void>((ok, fail) => {
      ws.onopen = () => ok();
      ws.onerror = () => fail(new Error('relay WebSocket failed'));
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as { type: string; intent_id?: string; record?: SignedRecord };
      if (!msg.intent_id) return;
      const done = waiting.get(msg.intent_id);
      if (!done) return;
      if (msg.type === 'intent.resolved') done(msg.record ?? null);
      if (msg.type === 'intent.expired') done(null);
    };
    const wait = (id: string) => new Promise<SignedRecord | null>((ok) => waiting.set(id, ok));
    try {
      for (const beat of this.scenario.beats) {
        if (beat.delay_s) await new Promise((r) => setTimeout(r, beat.delay_s! * 1000));
        let template = this.scenario.templates.find((t) => t.key === beat.template)!;
        let supersedes: string | undefined;
        for (let round = 0; round < 3; round++) {
          const call = await this.build(template);
          const sent = await this.submit(call, supersedes);
          if (!sent.held) break;
          const record = await wait(call.binding.intent_id);
          const suggested = record?.decision.reason?.code === 'counter_offer' ? record.decision.reason.suggested : undefined;
          if (!suggested) break;
          template = this.reproposal(beat.template, template, suggested);
          supersedes = call.binding.intent_id;
        }
      }
    } finally {
      ws.close();
    }
  }

  /** Scripted re-proposal when the scenario has one, else the same call with the suggested args. */
  reproposal(origin: string, current: IntentTemplate, suggested: Record<string, unknown>): IntentTemplate {
    const scripted = this.scenario.counter_offers?.[origin];
    const t = scripted ? this.scenario.templates.find((x) => x.key === scripted) : undefined;
    if (t && t.key !== current.key) return t;
    return { ...current, key: `${current.key}+re`, args: { ...current.args, ...suggested }, is_drill: false };
  }

  private relayUrl(path: string): string {
    return `${this.opts.relay.replace(/\/$/, '')}${path}`;
  }
}
