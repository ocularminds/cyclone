import type { Decision, DecisionKind, Gesture, ReasonCode } from '../../app/src/contracts/intent';
import { IntentHasher } from '../../app/src/core/hash';
import { GesturePolicy } from '../../app/src/flow/policy';
import type { Attestor } from './attest';
import type { RelayConfig } from './config';
import { Json, RelayError } from './errors';
import type { Hub } from './hub';
import type { PolicyBook } from './policy';
import type { Recorder } from './record';
import type { Sealer } from './seal';
import type { Entry, LiveRecord, Store, UpstreamNote } from './store';
import { NotConfigured, NotDocumented, UpstreamError, type AuthorityDecision, type Upstream } from './upstream';

const KINDS: DecisionKind[] = ['APPROVE', 'APPROVE_AMENDED', 'REJECT', 'ESCALATE', 'AUTO_APPROVE_RULE'];
const GESTURES: Gesture[] = ['place', 'two_hand_hold', 'one_hand_gaze_hold', 'gaze_pinch', 'veto_push', 'escalate_place', 'rule', 'timeout'];
const REASONS: ReasonCode[] = ['user_veto', 'expired', 'counter_offer', 'forbidden'];

/**
 * POST /intents/{id}/decision (AGENTS §8.1, C35). Enforces the same rules as
 * the demo gate (app/src/adapters/demo.ts): the decision must be bound to the
 * held hash (409), wall-clock TTL (410), forbidden never approves, the
 * amendment ceiling (422), idempotent per intent_id; then performs the
 * documented upstream step, verifies the dossier and seals the record.
 * Decisions on one intent run strictly one after another.
 */
export class Resolver {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: Store,
    private readonly policy: PolicyBook,
    private readonly sealer: Sealer,
    private readonly upstream: Upstream,
    private readonly attestor: Attestor | null,
    private readonly hub: Hub,
    private readonly cfg: RelayConfig,
    private readonly recorder: Recorder | null,
  ) {}

  static parse(raw: unknown, pathId: string): Decision {
    if (!Json.isObject(raw)) throw RelayError.badRequest('Expected a Decision object.');
    const d = raw as Record<string, unknown>;
    if (d.intent_id !== pathId) throw RelayError.badRequest('intent_id in the body must match the path.');
    if (!KINDS.includes(d.decision as DecisionKind)) throw RelayError.badRequest('Unknown decision kind.');
    if (!Json.str(d.intent_hash)) throw RelayError.badRequest('intent_hash is required.');
    if (!GESTURES.includes(d.gesture as Gesture)) throw RelayError.badRequest('Unknown gesture.');
    if (d.amended_args !== undefined && !Json.isObject(d.amended_args)) throw RelayError.badRequest('amended_args must be an object.');
    if (d.reason !== undefined) {
      if (!Json.isObject(d.reason) || !REASONS.includes(d.reason.code as ReasonCode)) throw RelayError.badRequest('Unknown reason code.');
      if (d.reason.suggested !== undefined && !Json.isObject(d.reason.suggested)) throw RelayError.badRequest('reason.suggested must be an object.');
    }
    return {
      intent_id: pathId,
      decision: d.decision as DecisionKind,
      intent_hash: d.intent_hash as string,
      ...(d.amended_args ? { amended_args: d.amended_args as Record<string, unknown> } : {}),
      ...(Json.str(d.amended_hash) ? { amended_hash: d.amended_hash as string } : {}),
      ...(d.reason ? { reason: d.reason as Decision['reason'] } : {}),
      gesture: d.gesture as Gesture,
      client_ts: Json.str(d.client_ts) ?? new Date(0).toISOString(),
    };
  }

  async resolve(raw: unknown, pathId: string, subject: string): Promise<LiveRecord> {
    const decision = Resolver.parse(raw, pathId);
    return this.serial(pathId, () => this.run(decision, subject));
  }

  /** One decision at a time per intent; a failure never blocks the next. */
  private serial<T>(id: string, task: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const next = prev.then(task, task);
    const tail = next.catch(() => undefined);
    this.locks.set(id, tail);
    void tail.then(() => {
      if (this.locks.get(id) === tail) this.locks.delete(id);
    });
    return next;
  }

  private async run(d: Decision, subject: string): Promise<LiveRecord> {
    const e = this.store.get(d.intent_id);
    if (!e?.intent || !e.binding) throw new RelayError(404, 'UNKNOWN_INTENT', 'No such held intent.');
    const intent = e.intent;
    // C13 — what you see is what you sign: bound to the held payload, recomputed here.
    const { intent_hash } = await IntentHasher.hash(e.binding);
    if (d.intent_hash !== intent.intent_hash || intent_hash !== intent.intent_hash) {
      throw new RelayError(409, 'HASH_MISMATCH', 'The decision is not bound to the held payload.');
    }
    // Idempotent per intent_id: the same decision returns the same record.
    if (e.final) {
      if (e.final.decision.decision === d.decision) return e.final;
      throw new RelayError(409, 'UNKNOWN_INTENT', 'Already resolved.');
    }
    if (d.decision === 'ESCALATE' && e.escalation) return e.escalation;
    if (e.state === 'withdrawn') throw new RelayError(410, 'EXPIRED', e.note ?? 'Withdrawn from the desk.');
    const expiredReject = d.decision === 'REJECT' && d.reason?.code === 'expired';
    if (this.cfg.now() >= Date.parse(intent.expires_at) && !expiredReject) {
      throw new RelayError(410, 'EXPIRED', 'This intent has expired; it never executed.');
    }

    switch (d.decision) {
      case 'APPROVE':
        this.gestureCheck(e, d);
        return this.approve(e, d, subject);
      case 'APPROVE_AMENDED':
        this.gestureCheck(e, d);
        return this.amended(e, d);
      case 'AUTO_APPROVE_RULE':
        // Live: delegated desk rules cannot speak for a person to the policy gate. The
        // client falls back to a normal held token; auto-execution belongs in the policy.
        throw new RelayError(403, 'FORBIDDEN', 'Desk rules do not auto-approve in live mode; decide this one by hand.');
      case 'REJECT':
        return this.reject(e, d, expiredReject);
      case 'ESCALATE':
        return this.escalate(e, d);
    }
  }

  /** Same gesture rules as the desk (GesturePolicy), with every accessibility variant allowed. */
  private gestureCheck(e: Entry, d: Decision): void {
    const refusal = GesturePolicy.check(e.intent!, d.decision, d.gesture, { eyesOnly: true, oneHanded: true, tampered: false });
    if (refusal) throw new RelayError(403, 'FORBIDDEN', refusal);
  }

  private holdDossier(e: Entry): string | undefined {
    return e.hold?.dossier_id ?? e.hook?.dossier_id;
  }

  /** docs/agentsafe.md §2b: re-present the held intent with a presence attestation. */
  private async approve(e: Entry, d: Decision, subject: string): Promise<LiveRecord> {
    if (!this.upstream.configured || !this.attestor) {
      throw new RelayError(503, 'UNAVAILABLE', 'Live approvals are not configured on the relay yet; the intent stays held.');
    }
    const intent = e.intent!;
    return this.upstreamStep(e, async () => {
      const attestation = this.attestor!.sign({
        tenant_id: e.binding!.tenant_id,
        intent_id: intent.intent_id,
        intent_hash: intent.intent_hash,
        subject,
        gesture: d.gesture,
      });
      let res: AuthorityDecision;
      try {
        res = await this.upstream.grant(e.binding!, intent.intent_hash, {
          mode: 'ENFORCEMENT',
          evidence: { humanApproval: { provider: 'attestation', attestation } },
        });
      } catch (err) {
        throw Resolver.upstreamFailure(err);
      }
      if (res.status !== 'ALLOW') {
        if (res.status === 'BLOCK') intent.policy = { ...intent.policy, requires: 'forbidden' };
        const why = res.reason_codes?.length ? ` (${res.reason_codes.join(', ')})` : '';
        throw new RelayError(403, 'FORBIDDEN', `The policy gate answered ${res.status}${why}; the intent stays held.`);
      }
      const record = await this.sealer.seal(intent, d, intent.args, res.dossier_id, {
        path: 'grant',
        decision_id: res.decision_id,
        status: res.status,
      });
      return this.finish(e, record, true);
    });
  }

  /** C12: amended approval. Pre-checks run here; the upstream call itself is undocumented (H1). */
  private async amended(e: Entry, d: Decision): Promise<LiveRecord> {
    if (!this.cfg.amendedApproval) {
      throw new RelayError(422, 'AMEND_UNSUPPORTED', 'This policy gate does not accept amended approvals; send a counter-offer.');
    }
    if (!d.amended_args || !d.amended_hash) throw RelayError.badRequest('amended_args and amended_hash are required.');
    let amendedHash: string;
    try {
      amendedHash = (await IntentHasher.hash(IntentHasher.amend(e.binding!, d.amended_args))).intent_hash;
    } catch (err) {
      throw RelayError.badRequest(`Amended call cannot be hashed: ${(err as Error).message}.`);
    }
    if (amendedHash !== d.amended_hash) throw new RelayError(409, 'HASH_MISMATCH', 'The amended call is not the one you rehearsed.');
    const denial = this.policy.amendment(e.intent!, e.binding!, d.amended_args);
    if (denial) throw new RelayError(422, 'AMEND_DENIED', denial);
    try {
      await this.upstream.approveAmended();
    } catch (err) {
      if (err instanceof NotDocumented) {
        throw new RelayError(501, 'AMEND_UNSUPPORTED', 'Amended approval is not available on the live policy gate yet; send a counter-offer.');
      }
      throw Resolver.upstreamFailure(err);
    }
    throw new RelayError(501, 'AMEND_UNSUPPORTED', 'Amended approval is not available on the live policy gate yet.');
  }

  private async reject(e: Entry, d: Decision, expiredReject: boolean): Promise<LiveRecord> {
    return this.upstreamStep(e, async () => {
      let note: UpstreamNote;
      const escalationId = e.hold?.escalation_id ?? e.hook?.escalation_id;
      if (expiredReject) {
        note = { path: 'expired', detail: 'Expired unresolved; the hold lapsed and nothing executed.' };
      } else if (escalationId && this.upstream.configured) {
        try {
          // docs/agentsafe.md §2b: cancel a managed escalation without authorizing execution.
          await this.upstream.cancelEscalation(escalationId);
          note = { path: 'escalation_cancelled', detail: escalationId };
        } catch (err) {
          note = { path: 'cancel_failed', detail: (err as Error).message };
        }
      } else if (this.cfg.upstream.reject) {
        try {
          await this.upstream.rejectHeld();
          note = { path: 'local' };
        } catch (err) {
          note = { path: 'not_documented', detail: (err as Error).message };
        }
      } else {
        note = { path: 'lapse', detail: 'No documented reject call; the hold lapses at expires_at and never executes.' };
      }
      const record = await this.sealer.seal(e.intent!, d, e.intent!.args, this.holdDossier(e), note);
      return this.finish(e, record, true);
    });
  }

  /** C09 / D5: flagged for a second reviewer; the intent stays held and still expires. */
  private async escalate(e: Entry, d: Decision): Promise<LiveRecord> {
    return this.upstreamStep(e, async () => {
      let note: UpstreamNote = { path: 'local', detail: 'Flagged for a second reviewer; the hold stays open until expires_at.' };
      if (this.cfg.upstream.escalate) {
        try {
          await this.upstream.escalateCase();
        } catch (err) {
          note = { path: 'not_documented', detail: (err as Error).message };
        }
      }
      const record = await this.sealer.seal(e.intent!, d, e.intent!.args, this.holdDossier(e), note);
      e.escalation = record;
      return this.finish(e, record, false);
    });
  }

  /** Marks the entry as mid-decision so a webhook cannot withdraw it underneath us. */
  private async upstreamStep<T>(e: Entry, step: () => Promise<T>): Promise<T> {
    const before = e.state;
    e.state = 'deciding';
    try {
      return await step();
    } finally {
      if (e.state === 'deciding') {
        e.state = before === 'deciding' ? 'held' : before;
        this.store.save();
      }
    }
  }

  private finish(e: Entry, record: LiveRecord, final: boolean): LiveRecord {
    if (final) {
      e.final = record;
      e.state = 'resolved';
    }
    this.store.save();
    this.recorder?.record(e, record);
    this.hub.broadcast({ type: 'record.sealed', intent_id: e.intent_id, record });
    if (final) this.hub.broadcast({ type: 'intent.resolved', intent_id: e.intent_id, record });
    return record;
  }

  /** Fail closed on expiry (C29): live TTL is wall clock; the relay seals REJECT(expired). */
  async sweep(): Promise<number> {
    const now = this.cfg.now();
    let n = 0;
    for (const e of this.store.all()) {
      if (!e.binding || now < Date.parse(e.binding.expires_at)) continue;
      if (e.state === 'pending') {
        e.state = 'expired';
        e.note = 'Expired before it reached the desk.';
        this.store.save();
        continue;
      }
      if (e.state !== 'held' || !e.intent) continue;
      await this.serial(e.intent_id, async () => {
        if (e.state !== 'held' || e.final) return;
        const intent = e.intent!;
        this.hub.broadcast({ type: 'intent.expired', intent_id: e.intent_id });
        const decision: Decision = {
          intent_id: intent.intent_id,
          decision: 'REJECT',
          intent_hash: intent.intent_hash,
          reason: { code: 'expired' },
          gesture: 'timeout',
          client_ts: new Date(now).toISOString(),
        };
        const record = await this.sealer.seal(intent, decision, intent.args, this.holdDossier(e), {
          path: 'expired',
          detail: 'Expired unresolved; the hold lapsed and nothing executed.',
        });
        this.finish(e, record, true);
        e.state = 'expired';
        this.store.save();
        n++;
      });
    }
    return n;
  }

  /** Upstream failures never approve anything: the intent stays held. */
  static upstreamFailure(err: unknown): RelayError {
    if (err instanceof RelayError) return err;
    if (err instanceof NotConfigured) return new RelayError(503, 'UNAVAILABLE', 'Live approvals are not configured on the relay yet.');
    if (err instanceof UpstreamError) {
      if (/INTENT_MISMATCH|INTENT_HASH_MISMATCH/.test(err.error)) {
        return new RelayError(409, 'HASH_MISMATCH', 'The policy gate holds a different payload for this intent.');
      }
      if (err.status === 401 || err.status === 403) {
        return new RelayError(503, 'UNAVAILABLE', 'The relay credentials were refused by the policy gate.');
      }
      return new RelayError(503, 'UNAVAILABLE', `The policy gate refused the approval (${err.status} ${err.error}); the intent stays held.`);
    }
    return new RelayError(503, 'UNAVAILABLE', 'The policy gate is unreachable; the intent stays held.');
  }
}
