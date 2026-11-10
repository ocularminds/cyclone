import { createHash } from 'node:crypto';
import { intentHash, jcsCanonicalize, stableJsonStringify } from '@decionis/verify';
import type { Decision, IntentBinding } from '../../app/src/contracts/intent';
import { Json } from './errors';

/** Constructed from the relay's held binding and validated decision, never a client verification flag. */
export type ExpectedDecision = {
  binding: IntentBinding;
  decision: Decision;
  dossier_id: string;
  decision_id: string;
};

export type AssociationResult = { verified: boolean; reason: string };

/**
 * Supported proof profile: signed /portable_artifact + /execution_binding.
 * The latter's payload.digest commits to the entire Agent-Safe intent, including
 * intent_id. See docs/agentsafe.md §9 and upstream docs/decision-dossiers.md.
 * An unsigned wrapper or an unrelated signed input snapshot is never sufficient.
 */
export class Association {
  static check(payload: Record<string, unknown>, paths: ReadonlySet<string>, expected?: ExpectedDecision): AssociationResult {
    const fail = (reason: string): AssociationResult => ({ verified: false, reason });
    if (!expected) return fail('Expected action context is missing.');
    const { binding, decision, dossier_id, decision_id } = expected;
    try {
      const base = intentHash(binding).intent_hash;
      if (binding.intent_id !== decision.intent_id || base !== decision.intent_hash) {
        return fail('The original held binding does not match the decision.');
      }
      let reviewed = binding;
      let hash = base;
      if (decision.decision === 'APPROVE_AMENDED') {
        if (!Json.isObject(decision.amended_args) || !decision.amended_hash) return fail('Amended arguments and hash are required.');
        reviewed = { ...binding, action: { ...binding.action, parameters: decision.amended_args } };
        hash = intentHash(reviewed).intent_hash;
        if (hash === base || hash !== decision.amended_hash) return fail('The amended binding does not match its distinct mutation hash.');
      } else if (decision.amended_hash !== undefined || decision.amended_args !== undefined) {
        return fail('Unexpected amended binding on an unchanged decision.');
      }
      // This published profile establishes an ALLOW. Local rejection/escalation
      // gestures are not signed by reusing the earlier hold's dossier.
      if (!['APPROVE', 'APPROVE_AMENDED'].includes(decision.decision)) {
        return fail('The published proof profile does not attest this local decision gesture.');
      }
      if (!paths.has('/portable_artifact') || !paths.has('/execution_binding')) {
        return fail('The signed action binding or signed decision artifact is missing.');
      }
      const portable = payload.portable_artifact;
      const execution = payload.execution_binding;
      if (!Json.isObject(portable) || !Json.isObject(execution)) return fail('Signed action evidence is malformed.');
      const route = portable.routing_decision, machine = portable.machine_readable, digest = execution.payload;
      if (!Json.isObject(route) || !Json.isObject(machine) || !Json.isObject(digest)) return fail('Signed decision details are missing.');
      if (!dossier_id || payload.dossier_id !== dossier_id || portable.dossier_id !== dossier_id || execution.dossier_id !== dossier_id) {
        return fail('Signed record identity does not match the requested dossier.');
      }
      if (!decision_id || route.decision_id !== decision_id || !route.evaluation_id || execution.evaluation_id !== route.evaluation_id) {
        return fail('Signed decision identity does not match the authorization.');
      }
      if (route.outcome !== 'APPROVE' || machine.outcome !== 'APPROVE' || machine.verdict !== 'ALLOW' ||
        route.authority !== 'AUTHORITATIVE' || machine.mode !== 'ENFORCEMENT' ||
        route.execution_grant_issued !== true || machine.execution_eligible !== true) {
        return fail('The signed verdict does not authorize the requested decision.');
      }
      if (execution.binding_schema_version !== '1.0' || digest.digest_algorithm !== 'SHA-256' ||
        digest.canonicalization_profile !== 'RFC8785/JCS' || digest.digest !== hash) {
        return fail('The signed payload digest does not cover this exact intent binding.');
      }
      const target = execution.execution_target;
      if (!Json.isObject(target) || target.resource !== reviewed.action.resource ||
        ['system', 'operation', 'environment', 'endpoint'].some(k =>
          (target[k] ?? undefined) !== (reviewed.downstream_target[k as keyof typeof reviewed.downstream_target] ?? undefined))) {
        return fail('The signed execution target differs from the reviewed target.');
      }
      const boundDigest = 'sha256:' + createHash('sha256').update(jcsCanonicalize(execution)).digest('hex');
      if (machine.execution_binding_digest !== boundDigest) return fail('The signed decision links a different execution binding.');
      if (execution.idempotency_key !== binding.context.idempotency_key) return fail('The signed idempotency scope differs from the held intent.');
      if (!Number.isFinite(Date.parse(String(execution.expires_at))) || Date.parse(String(execution.expires_at)) > Date.parse(binding.expires_at)) {
        return fail('The signed binding extends or omits the intent expiry.');
      }
      // Reproduction of the original hash also establishes the exact intent ID;
      // never hunt for matching strings elsewhere in the dossier.
      return { verified: true, reason: 'The signed decision and payload digest cover the exact reviewed action. The record is not an execution grant.' };
    } catch {
      return fail('Action evidence could not be canonicalized or compared.');
    }
  }

  /** A retry may have a new client timestamp; its decision and binding must be identical. */
  static sameDecision(a: Decision, b: Decision): boolean {
    const { client_ts: _a, ...first } = a, { client_ts: _b, ...second } = b;
    return stableJsonStringify(first) === stableJsonStringify(second);
  }
}
