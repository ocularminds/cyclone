import type { GateError, PolicyGateAdapter } from '../adapters/gate';
import type {
  Decision,
  DecisionKind,
  Gesture,
  HeldIntent,
  SignedRecord,
} from '../contracts/intent';
import type { RuleTemplate } from '../contracts/scenario';
import { Bus } from '../core/bus';
import type { Clock } from '../core/clock';
import { Glyph } from '../core/glyph';
import { IntentHasher } from '../core/hash';
import { Receipt } from '../core/receipt';
import { Proof } from '../core/proof';
import type { RehearsalResult } from '../sim/rehearsal';
import { Rehearsal } from '../sim/rehearsal';
import type { Calibration, DrillOutcome } from '../state/calibration';
import type { Ledger } from '../state/ledger';
import type { SessionLog } from '../state/session';
import type { Settings } from '../state/settings';
import type { TrustBook } from '../state/trust';
import { GesturePolicy } from './policy';

export type TokenStatus = 'held' | 'deciding' | 'escalated' | 'sealed' | 'expired' | 'unverified';

/** Client-side view of one held intent while it sits on the desk. */
export class Token {
  args: Record<string, unknown>;
  hash: string;
  glyph: Glyph;
  rehearsal: RehearsalResult;
  status: TokenStatus = 'held';
  denial: string | null = null;
  tampered = false;
  amending = false;
  editRevision = 0;
  validation: string | null = null;
  inspected = false;
  record: SignedRecord | null = null;

  constructor(
    readonly intent: HeldIntent,
    rehearsal: RehearsalResult,
    readonly arrivedMs: number,
    public deadlineMs: number,
  ) {
    this.args = { ...intent.args };
    this.hash = intent.intent_hash;
    this.glyph = Glyph.from(intent.intent_hash);
    this.rehearsal = rehearsal;
  }

  get id(): string {
    return this.intent.intent_id;
  }

  get amended(): boolean {
    const p = this.intent.amend?.param;
    return p !== undefined && this.args[p] !== this.intent.args[p];
  }

  get value(): number | null {
    const p = this.intent.amend?.param;
    const v = p ? this.args[p] : undefined;
    return typeof v === 'number' ? v : null;
  }

  /** Remaining TTL fraction 0..1 (drives the sink animation, C29). */
  life(nowMs: number): number {
    const span = this.deadlineMs - this.arrivedMs;
    return span <= 0 ? 0 : Math.max(0, Math.min(1, (this.deadlineMs - nowMs) / span));
  }
}

export type ShiftEvents = {
  arrived: Token;
  amended: Token;
  amending: Token;
  deciding: { token: Token; kind: DecisionKind };
  sealed: { token: Token; record: SignedRecord };
  escalated: { token: Token; record: SignedRecord };
  refused: { token: Token; reason: string };
  denied: { token: Token; reason: string };
  expired: Token;
  drill: { token: Token; caught: boolean; outcome: DrillOutcome };
  auto: { token: Token; record: SignedRecord; rule: RuleTemplate };
  offer: { rule: RuleTemplate };
  accepted: { rule: RuleTemplate };
  superseded: { token: Token; by: string };
};

/**
 * The shift: Intercept → Rehearse → Decide → Seal as a pure state machine.
 * ECS systems render it and feed it gestures; tests drive it directly.
 */
export class Shift {
  readonly events = new Bus<ShiftEvents>();
  private readonly tokens = new Map<string, Token>();
  private readonly cleanups: Array<() => void> = [];

  constructor(
    private readonly gate: PolicyGateAdapter,
    private readonly rehearsal: Rehearsal,
    private readonly clock: Clock,
    private readonly settings: Settings,
    private readonly ledger: Ledger,
    private readonly trust: TrustBook,
    private readonly calibration: Calibration,
    private readonly log: SessionLog,
    /** Demo adapter exposes session-clock deadlines; live uses wall-clock expires_at. */
    private readonly deadlineOf: (intent: HeldIntent) => number,
  ) {
    this.cleanups.push(
      gate.onIntent((e) => {
        if (e.type === 'held') void this.receive(e.intent);
        if (e.type === 'expired') {
          const t = this.tokens.get(e.intent_id);
          if (t && t.status !== 'sealed') this.markExpired(t);
        }
      }),
    );
  }

  get(id: string): Token | undefined {
    return this.tokens.get(id);
  }

  list(): Token[] {
    return [...this.tokens.values()];
  }

  /** Tokens still on the desk awaiting a decision, oldest first. */
  waiting(): Token[] {
    return this.list().filter((t) => t.status === 'held' || t.status === 'deciding');
  }

  async receive(intent: HeldIntent): Promise<Token> {
    const existing = this.tokens.get(intent.intent_id);
    if (existing) return existing;
    const r = this.rehearsal.run(intent.tool, intent.target.asset_id, intent.args);
    const token = new Token(intent, r, this.clock.ms, this.deadlineOf(intent));
    // Fail closed if the payload no longer matches the hash it was held under.
    token.tampered = !(await IntentHasher.matches(intent));
    this.tokens.set(intent.intent_id, token);
    if (intent.supersedes) {
      const old = this.tokens.get(intent.supersedes);
      if (old) this.events.emit('superseded', { token: old, by: intent.intent_id });
    }
    const rule = token.tampered || this.gate.capabilities.source !== 'demo' ? null : this.trust.match(intent);
    if (rule) {
      await this.autoApprove(token, rule);
      return token;
    }
    this.events.emit('arrived', token);
    return token;
  }

  /** Twist the dial (C04): new args → new binding hash, glyph and rehearsal. */
  async amend(id: string, value: number): Promise<Token | null> {
    const token = this.tokens.get(id);
    const spec = token?.intent.amend;
    if (!token || !spec || token.status !== 'held') return null;
    const steps = (value - spec.min) / spec.step;
    if (!Number.isFinite(value) || value < spec.min || value > spec.max || Math.abs(steps - Math.round(steps)) > 1e-6) {
      token.validation = `${value} ${spec.unit} is invalid. Use ${spec.min} to ${spec.max} ${spec.unit}, step ${spec.step}. Last valid: ${token.value} ${spec.unit}.`;
      this.events.emit('amending', token);
      return null;
    }
    token.validation = null;
    if (token.args[spec.param] === value) return token;
    const revision = ++token.editRevision;
    token.amending = true;
    this.events.emit('amending', token);
    token.args = { ...token.args, [spec.param]: value };
    token.denial = null;
    token.rehearsal = this.rehearsal.run(token.intent.tool, token.intent.target.asset_id, token.args);
    const hash = token.amended
      ? (await IntentHasher.hash(IntentHasher.amend(token.intent.binding!, token.args))).intent_hash
      : token.intent.intent_hash;
    if (revision !== token.editRevision) return null;
    token.hash = hash;
    token.glyph = Glyph.from(hash);
    token.amending = false;
    this.events.emit('amended', token);
    return token;
  }

  inspect(id: string): void {
    const t = this.tokens.get(id);
    if (t) t.inspected = true;
  }

  /** Gesture → decision. Returns the record, or null when refused/denied. */
  async decide(id: string, kind: DecisionKind, gesture: Gesture): Promise<SignedRecord | null> {
    const token = this.tokens.get(id);
    if (!token || token.status !== 'held' || token.amending) return null;
    if (token.validation && ['APPROVE', 'APPROVE_AMENDED', 'AUTO_APPROVE_RULE'].includes(kind)) {
      this.events.emit('refused', { token, reason: token.validation }); return null;
    }
    if (this.isExpired(token) && gesture !== 'timeout') { this.markExpired(token); return null; }
    const ctx = {
      eyesOnly: this.settings.get('eyesOnly'),
      oneHanded: this.settings.get('oneHanded'),
      tampered: token.tampered,
    };
    // An approval of changed args is APPROVE_AMENDED, or a counter-offer if the gate can't amend.
    if (kind === 'APPROVE' && token.amended) {
      if (this.gate.capabilities.supportsAmendedApproval) kind = 'APPROVE_AMENDED';
      else {
        const invalid = GesturePolicy.check(token.intent, 'APPROVE', gesture, ctx);
        if (invalid) { this.events.emit('refused', { token, reason: invalid }); return null; }
        return this.counterOffer(token, gesture);
      }
    }
    const refusal = GesturePolicy.check(token.intent, kind, gesture, ctx);
    if (refusal) {
      this.log.log({ t: this.clock.ms, type: 'refused', intent_id: id, note: refusal });
      this.events.emit('refused', { token, reason: refusal });
      return null;
    }
    const decision: Decision = {
      intent_id: id,
      decision: kind,
      intent_hash: token.intent.intent_hash,
      gesture,
      client_ts: new Date().toISOString(),
    };
    if (kind === 'APPROVE_AMENDED') {
      decision.amended_args = { ...token.args };
      decision.amended_hash = token.hash;
    }
    if (kind === 'REJECT') decision.reason = { code: gesture === 'timeout' ? 'expired' : 'user_veto' };
    return this.submit(token, decision);
  }

  /** C12 counter-offer path: reject with the user's amended values as a suggestion. */
  private async counterOffer(token: Token, gesture: Gesture): Promise<SignedRecord | null> {
    const spec = token.intent.amend!;
    const decision: Decision = {
      intent_id: token.id,
      decision: 'REJECT',
      intent_hash: token.intent.intent_hash,
      reason: { code: 'counter_offer', suggested: { [spec.param]: token.args[spec.param] } },
      gesture,
      client_ts: new Date().toISOString(),
    };
    return this.submit(token, decision);
  }

  private async submit(token: Token, decision: Decision): Promise<SignedRecord | null> {
    token.status = 'deciding';
    this.events.emit('deciding', { token, kind: decision.decision });
    let record: SignedRecord;
    try {
      const reviewed = await Receipt.capture(this.rehearsal, token.intent, token.args);
      record = await this.gate.resolve(decision, reviewed);
    } catch (err) {
      token.status = 'held';
      const e = err as GateError;
      const reason = e.detail || e.message;
      if (e.code === 'AMEND_DENIED') {
        token.denial = reason;
        this.log.log({ t: this.clock.ms, type: 'denied', intent_id: token.id, note: reason });
        this.events.emit('denied', { token, reason });
      } else {
        this.log.log({ t: this.clock.ms, type: 'refused', intent_id: token.id, note: e.message });
        this.events.emit('refused', { token, reason: Shift.explain(e) });
      }
      return null;
    }
    if (!Proof.matches(record, decision)) {
      token.status = 'unverified';
      token.denial = 'Record does not match this decision. Request already sent; approval is disabled.';
      this.events.emit('refused', { token, reason: token.denial });
      return null;
    }
    token.record = record;
    this.ledger.add(record);
    const kind = decision.decision;
    const counter = decision.reason?.code === 'counter_offer';
    this.log.log({
      t: this.clock.ms,
      type: 'decision',
      intent_id: token.id,
      decision: kind,
      amended: kind === 'APPROVE_AMENDED' || counter,
    });
    if (kind === 'ESCALATE') {
      token.status = 'escalated';
      this.events.emit('escalated', { token, record });
    } else {
      token.status = 'sealed';
      this.events.emit('sealed', { token, record });
    }
    this.afterDecision(token, decision);
    return record;
  }

  private afterDecision(token: Token, decision: Decision): void {
    const intent = token.intent;
    if (intent.is_drill) {
      const outcome: DrillOutcome = decision.reason?.code === 'expired' ? 'timeout'
        : decision.decision === 'ESCALATE' ? 'escalated'
        : decision.decision === 'REJECT' && decision.reason?.code === 'user_veto' ? 'caught'
        : token.amended && !token.rehearsal.breach ? 'corrected' : 'missed';
      const caught = outcome === 'caught' || outcome === 'corrected';
      this.calibration.record(outcome);
      this.log.log({ t: this.clock.ms, type: 'drill', intent_id: token.id, drill: outcome });
      this.events.emit('drill', { token, caught, outcome });
      this.trust.record(intent, 'drill');
      return;
    }
    if (decision.reason?.code === 'user_veto' && token.rehearsal.breach === null && intent.policy.requires !== 'forbidden') {
      this.calibration.falseAlarm();
      this.log.log({ t: this.clock.ms, type: 'false_alarm', intent_id: token.id });
    }
    const outcome =
      decision.decision === 'APPROVE'
        ? 'clean'
        : decision.decision === 'APPROVE_AMENDED' || decision.reason?.code === 'counter_offer'
          ? 'amended'
          : decision.decision === 'ESCALATE'
            ? 'escalated'
            : decision.reason?.code === 'expired'
              ? 'expired'
              : 'vetoed';
    const offer = this.trust.record(intent, outcome);
    if (offer) {
      this.log.log({ t: this.clock.ms, type: 'rule', note: `offered ${offer.id}` });
      this.events.emit('offer', { rule: offer });
    }
  }

  private async autoApprove(token: Token, rule: RuleTemplate): Promise<void> {
    if (this.isExpired(token) || this.trust.match(token.intent)?.id !== rule.id) return;
    token.status = 'deciding';
    const decision: Decision = {
      intent_id: token.id,
      decision: 'AUTO_APPROVE_RULE',
      intent_hash: token.intent.intent_hash,
      gesture: 'rule',
      client_ts: new Date().toISOString(),
    };
    try {
      const reviewed = await Receipt.capture(this.rehearsal, token.intent, token.args);
      if (this.isExpired(token) || this.trust.match(token.intent)?.id !== rule.id) throw new Error('RULE_NO_LONGER_VALID');
      const record = await this.gate.resolve(decision, reviewed);
      if (!Proof.matches(record, decision)) { token.status = 'unverified'; return; }
      token.status = 'sealed';
      token.record = record;
      this.ledger.add(record);
      this.log.log({ t: this.clock.ms, type: 'decision', intent_id: token.id, decision: 'AUTO_APPROVE_RULE' });
      this.events.emit('auto', { token, record, rule });
    } catch {
      // Gate refused the rule path (e.g. live mode): fall back to a normal held token.
      token.status = 'held';
      this.events.emit('arrived', token);
    }
  }

  /** Accept an offered rule by dropping it on its agent (C17). */
  acceptRule(ruleId: string, agentId: string): boolean {
    if (this.gate.capabilities.source !== 'demo') return false;
    const ok = this.trust.accept(ruleId, agentId);
    const rule = this.trust.accepted().find((r) => r.id === ruleId);
    if (ok && rule) {
      this.log.log({ t: this.clock.ms, type: 'rule', note: `accepted ${ruleId}` });
      this.events.emit('accepted', { rule });
      // the desk gets quieter at once: matching intents already waiting auto-execute too
      for (const t of this.waiting()) {
        if (t.status === 'held' && !t.tampered && this.trust.match(t.intent)?.id === ruleId) void this.autoApprove(t, rule);
      }
    }
    return ok;
  }

  isExpired(token: Token): boolean {
    return this.gate.capabilities.source === 'live'
      ? Date.now() >= Date.parse(token.intent.expires_at)
      : this.clock.ms >= token.deadlineMs;
  }

  /** Per-frame: fail closed on expiry (C29). */
  tick(): void {
    for (const t of this.tokens.values()) {
      if ((t.status === 'held' || t.status === 'escalated') && this.isExpired(t)) this.markExpired(t);
    }
  }

  private markExpired(token: Token): void {
    token.status = 'expired';
    this.log.log({ t: this.clock.ms, type: 'expired', intent_id: token.id });
    this.events.emit('expired', token);
    token.status = 'held';
    void this.decide(token.id, 'REJECT', 'timeout').then((rec) => {
      if (!rec) token.status = 'expired';
    });
  }

  static explain(e: GateError): string {
    switch (e.code) {
      case 'HASH_MISMATCH':
        return 'Refused: the payload changed after you rehearsed it.';
      case 'EXPIRED':
        return 'Refused: this intent has expired.';
      case 'FORBIDDEN':
        return 'Refused: the policy gate forbids this action.';
      case 'AMEND_UNSUPPORTED':
        return 'This policy does not accept amended approvals.';
      case 'UNAVAILABLE':
        return 'Policy gate unreachable. The intent stays held.';
      default:
        return `Refused: ${e.message}`;
    }
  }

  dispose(): void {
    this.cleanups.forEach((f) => f());
    this.events.clear();
  }
}
