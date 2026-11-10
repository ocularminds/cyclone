import { describe, expect, it } from 'vitest';
import { intentHash } from '@decionis/verify';
import type { Decision } from '../../app/src/contracts/intent';
import type { ExpectedDecision } from '../src/association';
import { Config } from '../src/config';
import { Verifier } from '../src/verify';
import { bind, FakeClock, fixture } from './rig';
import { SyntheticProof } from './proof';

async function sample() {
  const clock = new FakeClock(), proof = new SyntheticProof(), { binding, intent_hash } = await bind('arm', clock);
  const decision: Decision = { intent_id: binding.intent_id, intent_hash, decision: 'APPROVE', gesture: 'two_hand_hold', client_ts: new Date(clock.t).toISOString() };
  const payload = proof.create(binding);
  const expected: ExpectedDecision = { binding, decision, dossier_id: payload.dossier_id, decision_id: payload.portable_artifact.routing_decision.decision_id };
  const assess = (p = payload, e = expected, source = Config.PINNED_JWKS) => Verifier.assess(p, proof.jwks, source, decision.client_ts, e);
  return { proof, payload, expected, assess };
}

describe('signed action association, synthetic profile and ephemeral test key', () => {
  it('verifies the exact signed action/decision; no unsigned wrapper establishes association', async () => {
    const { payload, expected, assess } = await sample();
    expect(assess().verification).toMatchObject({ verified: true, intent_binding_verified: true, required_artifact_coverage_verified: true });
    const unsigned = structuredClone(payload);
    unsigned.intent_id = expected.decision.intent_id; unsigned.intent_hash = expected.decision.intent_hash;
    delete unsigned.execution_binding;
    expect(assess(unsigned).verification.verified).toBe(false);
  });

  it.each(['dossier', 'intent', 'hash', 'decision', 'target', 'idempotency', 'expiry'] as const)('rejects a validly signed wrong %s', async which => {
    const { proof, payload, expected, assess } = await sample();
    if (which === 'dossier') payload.portable_artifact.dossier_id = 'another-dossier';
    if (which === 'intent') {
      const other = { ...expected.binding, intent_id: '00000000-0000-4000-8000-000000000099' };
      payload.execution_binding.payload.digest = intentHash(other).intent_hash;
    }
    if (which === 'hash') payload.execution_binding.payload.digest = 'sha256:' + '0'.repeat(64);
    if (which === 'decision') payload.portable_artifact.routing_decision.outcome = 'REJECT';
    if (which === 'target') payload.execution_binding.execution_target.resource = 'other-arm';
    if (which === 'idempotency') payload.execution_binding.idempotency_key = 'different-attempt';
    if (which === 'expiry') payload.execution_binding.expires_at = '2099-01-01T00:00:00.000Z';
    proof.resign(payload);
    expect(assess().signatures).toBe(true);
    expect(assess().verification.verified).toBe(false);
  });

  it('rejects a wrong expected record, original hash, or upstream decision identity', async () => {
    const { assess, expected } = await sample();
    for (const e of [
      { ...expected, dossier_id: 'wrong' }, { ...expected, decision_id: 'wrong' },
      { ...expected, decision: { ...expected.decision, intent_hash: 'sha256:' + 'f'.repeat(64) } },
    ]) expect(assess(undefined, e).verification.verified).toBe(false);
  });

  it('checks amended parameters and hash as a distinct mutation under the same original binding', async () => {
    const { proof, expected, assess } = await sample();
    const amended_args = { ...expected.binding.action.parameters, deg_s: 180 };
    const amended = { ...expected.binding, action: { ...expected.binding.action, parameters: amended_args } };
    const decision = { ...expected.decision, decision: 'APPROVE_AMENDED' as const, amended_args, amended_hash: intentHash(amended).intent_hash };
    const e = { ...expected, decision }, payload = proof.create(amended);
    expect(assess(payload, e).verification.verified).toBe(true);
    expect(assess(payload, { ...e, decision: { ...decision, amended_hash: expected.decision.intent_hash } }).verification.verified).toBe(false);
    expect(assess(payload, { ...e, decision: { ...decision, amended_args: { ...amended_args, deg_s: 190 } } }).verification.verified).toBe(false);
  });

  it('requires signature, coverage and trusted key source in addition to association', async () => {
    const { payload, assess } = await sample();
    expect(assess(undefined, undefined, '/tmp/test-keys.json').verification.verified).toBe(false);
    payload.integrity.proof_bundle.artifacts = payload.integrity.proof_bundle.artifacts.filter((a: { artifact_kind: string }) => a.artifact_kind !== 'execution_binding');
    expect(assess().signatures).toBe(true);
    expect(assess().verification).toMatchObject({ verified: false, intent_binding_verified: false, required_artifact_coverage_verified: false });
    expect(assess(fixture('allow').dossier_payload).verification.verified).toBe(false);
  });

  it('rejects tampered signatures even if matching fields are still readable', async () => {
    const { payload, assess } = await sample();
    payload.portable_artifact.inputs_snapshot.context.action = 'tampered';
    expect(assess().verification.verified).toBe(false);
  });
});
