import { randomUUID } from 'node:crypto';
import type { Decision, HeldIntent } from '../../app/src/contracts/intent';
import { Rehearsal } from '../../app/src/sim/rehearsal';
import { NotConfigured, type Upstream } from './upstream';
import type { LiveRecord, UpstreamNote } from './store';
import { Verifier, type Checked } from './verify';

/**
 * Turns a decision into the SignedRecord the headset seals (AGENTS §5.3).
 * The signature is the policy gate's Decision Dossier, fetched
 * (docs/agentsafe.md §5) and verified here; with no dossier the record is
 * sealed unverified (fail closed, never executable).
 */
export class Sealer {
  constructor(
    private readonly upstream: Upstream,
    private readonly verifier: Verifier,
    private readonly now: () => number,
  ) {}

  /** Fetch and verify one dossier; every failure becomes an unverified check. */
  async dossier(dossierId: string | undefined): Promise<Checked> {
    const at = new Date(this.now()).toISOString();
    if (!dossierId) return Verifier.unavailable('No signed record from the policy gate for this decision; sealed as unverified.', at);
    if (!this.upstream.configured) {
      return Verifier.unavailable('Policy gate not configured on the relay; sealed as unverified.', at);
    }
    let body: unknown;
    try {
      body = await this.upstream.dossier(dossierId);
    } catch (err) {
      const why = err instanceof NotConfigured ? 'Policy gate not configured on the relay' : 'The signed record could not be fetched';
      return Verifier.unavailable(`${why}; sealed as unverified.`, at);
    }
    return this.verifier.check(body, dossierId);
  }

  async seal(
    intent: HeldIntent,
    decision: Decision,
    args: Record<string, unknown>,
    dossierId: string | undefined,
    note: UpstreamNote,
  ): Promise<LiveRecord> {
    const checked = await this.dossier(dossierId);
    return {
      record_id: randomUUID(),
      intent_id: intent.intent_id,
      decision,
      intent_hash: intent.intent_hash,
      ...(decision.amended_hash ? { amended_hash: decision.amended_hash } : {}),
      decided_at: new Date(this.now()).toISOString(),
      rehearsal: {
        args: { ...args },
        path_samples_ref: await Rehearsal.ref(intent.tool, intent.target.asset_id, args),
      },
      source: 'live',
      ...(checked.payload ? { dossier: checked.payload } : {}),
      verification: checked.verification,
      tool: intent.tool,
      asset_id: intent.target.asset_id,
      agent_id: intent.agent.id,
      is_drill: intent.is_drill === true,
      relay: note,
    };
  }
}
