import { isLive, type Decision, type SignedRecord } from '../contracts/intent';
import { Canon } from './canon';

/** Structural association is necessary, but is never a substitute for signature-covered association. */
export class Proof {
  static matches(record: SignedRecord, decision: Decision): boolean {
    return record.intent_id === decision.intent_id && record.intent_hash === decision.intent_hash &&
      record.amended_hash === decision.amended_hash && Canon.stringify(record.decision) === Canon.stringify(decision);
  }

  static official(record: SignedRecord): boolean {
    const v = record.verification;
    return record.source === 'live' && isLive(v) && v.verified === true &&
      v.required_artifact_coverage_verified === true && v.trust_anchor === 'DECIONIS_OFFICIAL' &&
      v.intent_binding_verified === true && Proof.matches(record, record.decision);
  }

  static approval(record: SignedRecord): boolean {
    return ['APPROVE', 'APPROVE_AMENDED', 'AUTO_APPROVE_RULE'].includes(record.decision.decision);
  }
}
