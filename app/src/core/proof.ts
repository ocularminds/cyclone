import { isLive, type Decision, type SignedRecord } from '../contracts/intent';
import { Canon } from './canon';

/** Structural association is necessary, but is never a substitute for signature-covered association. */
export class Proof {
  static readable(value: unknown): value is SignedRecord {
    if (!value || typeof value !== 'object') return false;
    const r = value as SignedRecord;
    const v = r.verification;
    return typeof r.record_id === 'string' && typeof r.intent_id === 'string' && typeof r.intent_hash === 'string' && typeof r.decided_at === 'string' &&
      !!r.decision && typeof r.decision === 'object' && ['APPROVE', 'APPROVE_AMENDED', 'REJECT', 'ESCALATE', 'AUTO_APPROVE_RULE'].includes(r.decision.decision) &&
      typeof r.decision.intent_id === 'string' && typeof r.decision.intent_hash === 'string' && typeof r.decision.gesture === 'string' &&
      !!r.rehearsal && typeof r.rehearsal === 'object' && !!r.rehearsal.args && typeof r.rehearsal.args === 'object' && !Array.isArray(r.rehearsal.args) &&
      !!v && typeof v === 'object' && (r.source === 'live' ? isLive(v) && typeof v.verified === 'boolean' && typeof v.required_artifact_coverage_verified === 'boolean' &&
        [v.trust_anchor, v.issuer_tier, v.assurance_scope_summary, v.checked_at].every(x => typeof x === 'string') : r.source === 'demo' && !isLive(v) && typeof v.demo_signature === 'string' && typeof v.key_id === 'string');
  }

  static matches(record: SignedRecord, decision: Decision): boolean {
    if (!Proof.readable(record) || !decision || typeof decision !== 'object') return false;
    const { client_ts: _sent, ...sent } = decision, { client_ts: _saved, ...saved } = record.decision;
    return record.intent_id === decision.intent_id && record.intent_hash === decision.intent_hash &&
      record.amended_hash === decision.amended_hash && Canon.stringify(saved) === Canon.stringify(sent);
  }

  static official(record: SignedRecord): boolean {
    const v = record.verification;
    return record.source === 'live' && isLive(v) && v.verified === true &&
      v.required_artifact_coverage_verified === true && v.trust_anchor === 'DECIONIS_OFFICIAL' &&
      v.intent_binding_verified === true && Proof.matches(record, record.decision) &&
      (!Proof.approval(record) || record.authorization?.status === 'approved');
  }

  static approval(record: SignedRecord): boolean {
    return ['APPROVE', 'APPROVE_AMENDED', 'AUTO_APPROVE_RULE'].includes(record.decision.decision);
  }

  static known(record: SignedRecord): boolean {
    return record.source === 'demo' || !!record.authorization && !['unknown', 'held'].includes(record.authorization.status);
  }

  static revision(record: SignedRecord): number {
    return Number.isSafeInteger(record.revision) && record.revision! >= 0 ? record.revision! : 0;
  }
}
