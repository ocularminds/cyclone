import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { intentHash, jcsCanonicalize, stableJsonStringify } from '@decionis/verify';
import type { IntentBinding } from '../../app/src/contracts/intent';
import { RELAY_ROOT } from '../src/config';

/** Ephemeral test key and synthetic profile documents. Never a production issuer. */
export class SyntheticProof {
  private readonly key = generateKeyPairSync('ed25519');
  readonly kid = 'cyclone-revision1-test-only';
  readonly jwks = { keys: [{ ...this.key.publicKey.export({ format: 'jwk' }), kid: this.kid, alg: 'EdDSA', use: 'sig' }] };
  private digest(text: string): string { return createHash('sha256').update(text).digest('hex'); }

  create(binding: IntentBinding): Record<string, any> {
    const p = JSON.parse(readFileSync(join(RELAY_ROOT, 'src/fixtures/dossiers/allow.json'), 'utf8')).dossier_payload;
    const dossierId = 'test-dossier-' + binding.intent_id, decisionId = 'dec-' + binding.intent_id;
    const hash = intentHash(binding).intent_hash;
    p.dossier_id = dossierId; p.evaluation_id = decisionId;
    p.inputs_snapshot = { ...p.inputs_snapshot, decision_type: binding.action.type, transaction_type: binding.action.type,
      context: { tenant_id: binding.tenant_id, actor_id: binding.actor.id, action: binding.action.type, target: binding.action.resource, ...binding.action.parameters } };
    const portable = p.portable_artifact, execution = p.execution_binding;
    portable.dossier_id = dossierId; portable.inputs_snapshot = structuredClone(p.inputs_snapshot);
    portable.routing_decision.decision_id = decisionId; portable.routing_decision.evaluation_id = decisionId;
    portable.machine_readable.dossier_id = dossierId; portable.machine_readable.evaluation_id = decisionId;
    portable.machine_readable.input_snapshot_digest = 'sha256:' + this.digest(stableJsonStringify(p.inputs_snapshot));
    execution.dossier_id = dossierId; execution.evaluation_id = decisionId; execution.payload.digest = hash;
    execution.execution_target = { ...binding.downstream_target, resource: binding.action.resource, endpoint: binding.downstream_target.endpoint ?? null };
    execution.expires_at = binding.expires_at; execution.issued_at = binding.captured_at; execution.not_before = binding.captured_at;
    execution.idempotency_key = binding.context.idempotency_key;
    p.routing_decision = structuredClone(portable.routing_decision);
    p.linked_data.document = { ...p.linked_data.document, dossierId, decisionId, intentHash: hash };
    return this.resign(p);
  }

  resign(p: Record<string, any>): Record<string, any> {
    const bundle = p.integrity.proof_bundle;
    bundle.key_id = this.kid; bundle.rotation_policy.active_key_id = this.kid;
    p.portable_artifact.machine_readable.execution_binding_digest = 'sha256:' + this.digest(jcsCanonicalize(p.execution_binding));
    const machine = p.portable_artifact.machine_readable;
    for (const key of Object.keys(p.authority_evidence)) p.authority_evidence[key] = machine[key === 'evaluation_mode' ? 'mode' : key];
    for (const a of bundle.artifacts) {
      const document = a.document_path.split('/').slice(1).reduce((node: any, key: string) => node[key], p);
      const bytes = a.canonicalization_profile === 'RFC8785/JCS' ? jcsCanonicalize(document) : stableJsonStringify(document);
      a.canonical_document_sha256 = this.digest(bytes);
      a.signature = sign(null, Buffer.from(bytes), this.key.privateKey).toString('base64url');
    }
    return p;
  }
}
