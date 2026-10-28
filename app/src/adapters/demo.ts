import type { Decision, HeldIntent, SignedRecord } from '../contracts/intent';
import type { Clock } from '../core/clock';
import { IntentHasher } from '../core/hash';
import type { Rng } from '../core/rng';
import type { DemoSigner } from '../core/signer';
import type { ScenarioEngine } from '../scenario/engine';
import { Rehearsal } from '../sim/rehearsal';
import {
  GateError,
  type GateCapabilities,
  type IntentEvent,
  type PolicyGateAdapter,
} from './gate';

/**
 * Demo policy gate (C34): wraps the scenario engine, enforces the same rules
 * as the live relay (hash binding, TTL, idempotency, forbidden, amendment
 * ceiling) and signs records locally with the demo key.
 */
export class DemoAdapter implements PolicyGateAdapter {
  readonly capabilities: GateCapabilities;
  private readonly held = new Map<string, { intent: HeldIntent; deadline: number }>();
  private readonly resolved = new Map<string, SignedRecord>();
  private readonly listeners = new Set<(e: IntentEvent) => void>();

  constructor(
    private readonly engine: ScenarioEngine,
    private readonly signer: DemoSigner,
    private readonly clock: Clock,
    private readonly rng: Rng,
    supportsAmendedApproval = true,
  ) {
    this.capabilities = { supportsAmendedApproval, source: 'demo' };
  }

  async connect(): Promise<void> {
    await this.signer.keys();
    this.engine.onSpawn(({ intent }) => {
      const b = intent.binding!;
      const ttl = Date.parse(b.expires_at) - Date.parse(b.captured_at);
      this.held.set(intent.intent_id, { intent, deadline: this.clock.ms + ttl });
      this.emit({ type: 'held', intent });
    });
  }

  onIntent(cb: (event: IntentEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: IntentEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  tick(): void {
    this.engine.tick();
  }

  /** Session-clock deadline (ms) for a held intent; demo TTLs pause with the clock (C29). */
  deadline(intentId: string): number | undefined {
    return this.held.get(intentId)?.deadline;
  }

  async resolve(decision: Decision): Promise<SignedRecord> {
    const prior = this.resolved.get(decision.intent_id);
    if (prior) {
      if (prior.decision.decision === decision.decision) return prior;
      throw new GateError('UNKNOWN_INTENT', 'already resolved');
    }
    const entry = this.held.get(decision.intent_id);
    if (!entry) throw new GateError('UNKNOWN_INTENT');
    const { intent } = entry;
    // What you see is what you sign: the client's hash must equal the held binding's.
    const { intent_hash } = await IntentHasher.hash(intent.binding);
    if (decision.intent_hash !== intent.intent_hash || intent_hash !== intent.intent_hash) {
      throw new GateError('HASH_MISMATCH');
    }
    const expiredReject = decision.decision === 'REJECT' && decision.reason?.code === 'expired';
    if (this.clock.ms > entry.deadline && !expiredReject) throw new GateError('EXPIRED');
    const approving = decision.decision === 'APPROVE' || decision.decision === 'APPROVE_AMENDED';
    if (approving && intent.policy.requires === 'forbidden') throw new GateError('FORBIDDEN');

    let args = intent.args;
    if (decision.decision === 'APPROVE_AMENDED') {
      if (!this.capabilities.supportsAmendedApproval) throw new GateError('AMEND_UNSUPPORTED');
      args = decision.amended_args ?? {};
      const amended = await IntentHasher.hash(IntentHasher.amend(intent.binding!, args));
      if (amended.intent_hash !== decision.amended_hash) throw new GateError('HASH_MISMATCH', 'amended');
      const denial = DemoAdapter.evaluateAmendment(intent, args);
      if (denial) throw new GateError('AMEND_DENIED', denial);
    }

    const record = await this.signer.sign({
      record_id: this.rng.uuid(),
      intent_id: intent.intent_id,
      decision,
      intent_hash: intent.intent_hash,
      ...(decision.amended_hash ? { amended_hash: decision.amended_hash } : {}),
      decided_at: this.clock.iso(),
      rehearsal: {
        args: { ...args },
        path_samples_ref: await Rehearsal.ref(intent.tool, intent.target.asset_id, args),
      },
      source: 'demo',
      tool: intent.tool,
      asset_id: intent.target.asset_id,
      agent_id: intent.agent.id,
      is_drill: intent.is_drill === true,
    });
    if (decision.decision !== 'ESCALATE') {
      this.resolved.set(intent.intent_id, record);
      this.held.delete(intent.intent_id);
    }
    const suggested = decision.reason?.code === 'counter_offer' ? decision.reason.suggested : undefined;
    this.engine.decided(intent.intent_id, suggested);
    this.emit({ type: 'resolved', intent_id: intent.intent_id, record });
    return record;
  }

  /**
   * Demo stand-in for the provisioned policy re-evaluating an amended call:
   * the amended value must sit inside [min, safe_max ?? max].
   */
  static evaluateAmendment(intent: HeldIntent, args: Record<string, unknown>): string | null {
    const spec = intent.amend;
    if (!spec) return 'This action has no amendable parameter.';
    for (const key of Object.keys(args)) {
      if (key !== spec.param && args[key] !== intent.args[key]) return `Only ${spec.param} may change.`;
    }
    const v = args[spec.param];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `${spec.param} must be a number.`;
    const ceiling = spec.safe_max ?? spec.max;
    if (v < spec.min || v > ceiling) {
      return `Policy ceiling is ${ceiling}${spec.unit}; ${v}${spec.unit} is outside it.`;
    }
    return null;
  }

  disconnect(): void {
    this.listeners.clear();
  }
}
