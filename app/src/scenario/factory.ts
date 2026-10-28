import type { HeldIntent, IntentBinding } from '../contracts/intent';
import type { Cast, IntentTemplate } from '../contracts/scenario';
import type { Clock } from '../core/clock';
import { IntentHasher } from '../core/hash';
import type { Rng } from '../core/rng';

/**
 * Turns a scenario template into a held intent in the policy gate's shape:
 * an Agent-Safe Intent v1 binding plus its hash, as the held-intent webhook
 * would deliver it.
 */
export class IntentFactory {
  constructor(
    private readonly cast: Cast,
    private readonly clock: Clock,
    private readonly rng: Rng,
  ) {}

  binding(t: IntentTemplate, intentId: string, ttl: number): IntentBinding {
    return {
      protocol_version: 'agent-safe.intent/1',
      tenant_id: this.cast.tenant_id,
      intent_id: intentId,
      captured_at: this.clock.iso(),
      expires_at: this.clock.iso(ttl * 1000),
      actor: { id: t.agent_id, type: 'agent', runtime: 'cyclone-demo' },
      action: { type: t.tool, resource: t.target.asset_id, parameters: { ...t.args } },
      context: { idempotency_key: this.rng.uuid() },
      downstream_target: { ...t.downstream, environment: 'demo' },
    };
  }

  async build(t: IntentTemplate, supersedes?: string): Promise<HeldIntent> {
    const agent = this.cast.agents.find((a) => a.id === t.agent_id);
    if (!agent) throw new Error(`UNKNOWN_AGENT:${t.agent_id}`);
    const intentId = this.rng.uuid();
    const binding = this.binding(t, intentId, t.ttl_s);
    const { intent_hash } = await IntentHasher.hash(binding);
    const intent: HeldIntent = {
      intent_id: intentId,
      agent: { id: agent.id, label: agent.label },
      tool: t.tool,
      args: { ...t.args },
      target: { ...t.target },
      policy: { ...t.policy },
      risk: { level: t.risk.level, reasons: [...t.risk.reasons] },
      rationale: t.rationale,
      summary: t.summary,
      expires_at: binding.expires_at,
      intent_hash,
      binding,
    };
    if (t.amend) intent.amend = { ...t.amend };
    if (t.is_drill) intent.is_drill = true;
    if (supersedes) intent.supersedes = supersedes;
    return intent;
  }
}
