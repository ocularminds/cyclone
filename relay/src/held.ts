import { bindingFailure } from '@decionis/verify';
import { readFileSync } from 'node:fs';
import type { HeldIntent, IntentBinding } from '../../app/src/contracts/intent';
import { IntentHasher } from '../../app/src/core/hash';
import type { RelayConfig } from './config';
import { Brand, Json, RelayError } from './errors';
import type { Hub } from './hub';
import type { PolicyBook } from './policy';
import type { Recorder } from './record';
import type { Entry, EntryState, Hold, Presentation, Store } from './store';
import type { GrantStatus } from './upstream';
import type { HeldEvent, ResolvedEvent } from './webhook';

/** Body of POST /held: the agent's full binding plus the policy gate's answer to it. */
export type Handoff = {
  binding: IntentBinding;
  intent_hash: string;
  authority: Hold;
  presentation?: Presentation;
};

const STATUSES: GrantStatus[] = ['ALLOW', 'ESCALATE', 'BLOCK', 'REVIEW_REQUIRED', 'ERROR'];
/** escalation_resolved outcomes after which the desk can no longer decide (docs/agentsafe.md §1). */
const FINAL_OUTCOMES = new Set(['ALLOW', 'BLOCK', 'REFUSED', 'ERROR']);

/**
 * Held-intent intake. The webhook (docs/agentsafe.md §1) carries `intent_hash`
 * but not the binding, so the agent hands the binding over on POST /held; the
 * two are merged by intent_id. An intent reaches the desk only when its binding
 * re-hashes (shared Intent v1 code) to the stated hash, and any webhook for it
 * agrees on that hash. Any disagreement withdraws it (fail closed).
 */
export class Intake {
  constructor(
    private readonly store: Store,
    private readonly policy: PolicyBook,
    private readonly hub: Hub,
    private readonly cfg: RelayConfig,
    private readonly labels: Map<string, string>,
    private readonly recorder: Recorder | null,
  ) {}

  /** Agent id → display label from the shared cast (app/src/scenario/agents.json). */
  static labels(castPath: string): Map<string, string> {
    try {
      const cast = JSON.parse(readFileSync(castPath, 'utf8')) as { agents?: Array<{ id: string; label: string }> };
      return new Map((cast.agents ?? []).map((a) => [a.id, a.label]));
    } catch {
      return new Map();
    }
  }

  static parseHandoff(raw: unknown): Handoff {
    if (!Json.isObject(raw) || !Json.isObject(raw.binding)) throw RelayError.badRequest('Expected { binding, intent_hash, authority }.');
    const hash = Json.str(raw.intent_hash);
    if (!hash || !/^sha256:[0-9a-f]{64}$/.test(hash)) throw RelayError.badRequest('intent_hash must be sha256:<64 hex>.');
    const a = raw.authority;
    if (!Json.isObject(a) || !STATUSES.includes(a.status as GrantStatus)) {
      throw RelayError.badRequest(`authority.status must be one of ${STATUSES.join(', ')}.`);
    }
    const p = Json.isObject(raw.presentation) ? raw.presentation : {};
    return {
      binding: raw.binding as IntentBinding,
      intent_hash: hash,
      authority: {
        status: a.status as GrantStatus,
        decision_id: Json.str(a.decision_id),
        dossier_id: Json.str(a.dossier_id),
        escalation_id: Json.str(a.escalation_id) ?? null,
        reason_codes: Json.strings(a.reason_codes),
      },
      presentation: {
        summary: Json.str(p.summary),
        rationale: Json.str(p.rationale),
        drill: p.drill === true,
        supersedes: Json.str(p.supersedes),
        agent_label: Json.str(p.agent_label),
      },
    };
  }

  async handoff(raw: unknown): Promise<{ intent_id: string; state: EntryState; presented: boolean }> {
    const h = Intake.parseHandoff(raw);
    const failure = bindingFailure(h.binding);
    if (failure) throw RelayError.badRequest(`Binding is not Agent-Safe Intent v1: ${failure}.`);
    let hash: string;
    try {
      hash = (await IntentHasher.hash(h.binding)).intent_hash;
    } catch (err) {
      throw RelayError.badRequest(`Binding cannot be hashed: ${(err as Error).message}.`);
    }
    // C13: the hash the desk will sign is recomputed here, never taken on trust.
    if (hash !== h.intent_hash) throw new RelayError(409, 'HASH_MISMATCH', 'intent_hash does not match the binding.');
    const orgId = this.cfg.upstream.orgId;
    if (orgId && h.binding.tenant_id !== orgId) throw new RelayError(403, 'UNAUTHORIZED', 'Binding is for another tenant.');
    if (h.authority.status === 'ALLOW') throw new RelayError(409, 'NOT_HELD', 'An ALLOW is not held; nothing to decide.');
    if (this.cfg.now() >= Date.parse(h.binding.expires_at)) throw new RelayError(410, 'EXPIRED', 'Intent already expired.');

    const id = h.binding.intent_id;
    const existing = this.store.get(id);
    if (existing) {
      const other = existing.intent_hash ?? existing.hook?.intent_hash;
      if (other && other !== hash) {
        this.withdraw(existing, 'Conflicting payloads for one intent.');
        throw new RelayError(409, 'HASH_MISMATCH', 'Another payload is already held under this intent_id; withdrawn.');
      }
      if (existing.state !== 'pending') return { intent_id: id, state: existing.state, presented: Boolean(existing.intent) };
    }
    const e = this.store.ensure(id);
    e.binding = h.binding;
    e.intent_hash = hash;
    e.hold = {
      ...h.authority,
      dossier_id: h.authority.dossier_id ?? e.hook?.dossier_id,
      decision_id: h.authority.decision_id ?? e.hook?.decision_id,
      escalation_id: h.authority.escalation_id ?? e.hook?.escalation_id ?? null,
    };
    e.presentation = h.presentation;
    this.recorder?.handoff(id, h);
    this.promote(e);
    this.store.save();
    return { intent_id: id, state: e.state, presented: Boolean(e.intent) };
  }

  /** docs/agentsafe.md §1: `authority.escalation_required` / `authority.escalation_resolved`. */
  webhook(ev: HeldEvent | ResolvedEvent, raw: string): { status: string; intent_id: string } {
    const orgId = this.cfg.upstream.orgId;
    if (orgId && ev.tenant_id && ev.tenant_id !== orgId) return { status: 'ignored', intent_id: ev.intent_id };
    this.recorder?.webhook(ev.intent_id, raw);
    if (ev.name === 'authority.escalation_resolved') return this.resolved(ev);

    const e = this.store.ensure(ev.intent_id);
    const known = e.intent_hash ?? e.hook?.intent_hash;
    if (known && known !== ev.intent_hash) {
      this.withdraw(e, 'Webhook hash differs from the held payload.');
      return { status: 'conflict', intent_id: e.intent_id };
    }
    e.hook = {
      intent_hash: ev.intent_hash,
      expires_at: ev.expires_at,
      decision_id: ev.decision_id,
      dossier_id: ev.dossier_id,
      escalation_id: ev.escalation_id,
      reason_codes: ev.reason_codes,
      received_at: new Date(this.cfg.now()).toISOString(),
    };
    if (e.hold) {
      e.hold.dossier_id ??= ev.dossier_id;
      e.hold.decision_id ??= ev.decision_id;
      e.hold.escalation_id ??= ev.escalation_id;
    }
    this.promote(e);
    this.store.save();
    return { status: e.state === 'held' ? 'held' : e.state, intent_id: e.intent_id };
  }

  private resolved(ev: ResolvedEvent): { status: string; intent_id: string } {
    const e = this.store.get(ev.intent_id);
    if (!e) return { status: 'ignored', intent_id: ev.intent_id };
    const known = e.intent_hash ?? e.hook?.intent_hash;
    if (known && known !== ev.intent_hash) return { status: 'ignored', intent_id: ev.intent_id };
    const outcome = ev.outcome ?? 'UNKNOWN';
    e.note = `Upstream outcome ${outcome}.`;
    // Our own decision is in flight, or already sealed: just note what upstream said.
    if (e.final || e.state === 'deciding' || !FINAL_OUTCOMES.has(outcome)) {
      this.store.save();
      return { status: 'noted', intent_id: e.intent_id };
    }
    this.withdraw(e, `Resolved outside the desk (${outcome}); it can no longer be decided here.`);
    return { status: 'withdrawn', intent_id: e.intent_id };
  }

  /** Put an intent on the desk once everything needed has arrived. */
  private promote(e: Entry): void {
    if (e.state !== 'pending' || !e.binding || !e.intent_hash || !e.hold) return;
    if (this.cfg.now() >= Date.parse(e.binding.expires_at)) {
      e.state = 'expired';
      return;
    }
    // Only an ESCALATE has a webhook (§1); BLOCK and REVIEW holds come from the agent alone.
    if (e.hold.status === 'ESCALATE' && this.cfg.requireWebhook && !e.hook) return;
    e.intent = this.build(e);
    e.state = 'held';
    this.hub.broadcast({ type: 'intent.held', intent: e.intent });
  }

  /** The client HeldIntent (AGENTS §5.1) for a merged entry. */
  build(e: Entry): HeldIntent {
    const b = e.binding!;
    const p = e.presentation ?? {};
    const presented = this.policy.present(b, e.hold!.status);
    const intent: HeldIntent = {
      intent_id: b.intent_id,
      agent: { id: b.actor.id, label: this.labels.get(b.actor.id) ?? Brand.scrub(p.agent_label ?? b.actor.id) },
      tool: b.action.type,
      args: { ...b.action.parameters },
      target: { asset_id: b.action.resource },
      policy: presented.policy,
      risk: presented.risk,
      ...(p.rationale ? { rationale: Brand.scrub(p.rationale) } : {}),
      ...(p.summary ? { summary: Brand.scrub(p.summary) } : {}),
      expires_at: b.expires_at,
      intent_hash: e.intent_hash!,
      binding: b,
    };
    if (presented.amend) intent.amend = presented.amend;
    if (p.drill) intent.is_drill = true;
    if (p.supersedes) intent.supersedes = p.supersedes;
    return intent;
  }

  /** Take an intent off the desk without a decision (conflict or resolved elsewhere). */
  withdraw(e: Entry, note: string): void {
    if (e.state === 'resolved' || e.state === 'expired' || e.state === 'withdrawn') return;
    const wasShown = e.state === 'held' || e.state === 'deciding';
    e.state = 'withdrawn';
    e.note = note;
    if (wasShown) this.hub.broadcast({ type: 'intent.expired', intent_id: e.intent_id });
    this.store.save();
  }
}
