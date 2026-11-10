import { randomUUID } from 'node:crypto';
import type { Authorization, Decision, HeldIntent } from '../../app/src/contracts/intent';
import type { ExpectedDecision } from './association';
import { NotConfigured, type Upstream } from './upstream';
import type { LiveRecord, UpstreamNote } from './store';
import { Verifier, type Checked } from './verify';

/** Keeps authorization, proof, retained local rehearsal, and execution distinct. */
export class Sealer {
  constructor(private readonly upstream: Upstream, private readonly verifier: Verifier, private readonly now: () => number) {}

  async dossier(dossierId: string | undefined, expected?: ExpectedDecision, refresh = false): Promise<Checked> {
    const at = new Date(this.now()).toISOString();
    if (!dossierId) return Verifier.unavailable('No signed record is available for this decision.', at);
    if (!this.upstream.configured) return Verifier.unavailable('Policy gate not configured on the relay.', at);
    let body: unknown;
    try { body = await this.upstream.dossier(dossierId); }
    catch (err) {
      return Verifier.unavailable(err instanceof NotConfigured ? 'Policy gate not configured on the relay.' : 'The signed record could not be fetched. Retry its verification; do not approve again.', at);
    }
    return this.verifier.check(body, expected ?? dossierId, refresh);
  }

  /** Synchronous so an authorization attempt can be durably saved before network dispatch. */
  prepare(intent: HeldIntent, decision: Decision, args: Record<string, unknown>, authorization: Authorization, note: UpstreamNote): LiveRecord {
    const at = new Date(this.now()).toISOString();
    return {
      record_id: randomUUID(), intent_id: intent.intent_id, decision: structuredClone(decision),
      intent_hash: intent.intent_hash, ...(decision.amended_hash ? { amended_hash: decision.amended_hash } : {}),
      decided_at: at,
      // The relay did not observe the headset's model. The client attaches its
      // independently digested local_rehearsal; no history is invented here.
      rehearsal: { args: structuredClone(args), path_samples_ref: 'rehearsal:unavailable' },
      source: 'live', authority_binding: structuredClone(intent.binding!), authorization,
      execution: { eligible: false, status: 'not_requested', reason: 'A decision record is not an execution grant. No actuator is connected.' },
      verification: { ...Verifier.unavailable('Checking decision record.', at).verification, proof_status: 'pending' },
      revision: 1, tool: intent.tool, asset_id: intent.target.asset_id, agent_id: intent.agent.id,
      is_drill: intent.is_drill === true, relay: note,
    };
  }

  /** Retrieval only: record ID, original decision and authorization do not change. */
  async check(record: LiveRecord, refresh = false): Promise<LiveRecord> {
    const auth = record.authorization;
    const expected = record.authority_binding && auth?.dossier_id && auth.decision_id
      ? { binding: record.authority_binding, decision: record.decision, dossier_id: auth.dossier_id, decision_id: auth.decision_id } : undefined;
    const checked = await this.dossier(auth?.dossier_id, expected, refresh);
    return {
      ...record, ...(checked.payload ? { dossier: checked.payload } : {}),
      verification: checked.verification, revision: (record.revision ?? 0) + 1,
      execution: { eligible: false, status: 'not_requested', reason: 'A checked record is evidence of permission, not a claimed execution grant or an observed machine result.' },
    };
  }

  async seal(intent: HeldIntent, decision: Decision, args: Record<string, unknown>, dossierId: string | undefined, note: UpstreamNote): Promise<LiveRecord> {
    const status = note.path === 'expired' ? 'expired' : decision.decision === 'ESCALATE' ? 'escalated' : decision.decision === 'REJECT' ? 'rejected' : 'approved';
    return this.check(this.prepare(intent, decision, args, {
      status, source: note.path === 'grant' ? 'policy_gate' : 'relay', decision_id: note.decision_id, dossier_id: dossierId,
    }, note));
  }
}
