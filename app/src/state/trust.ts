import type { HeldIntent } from '../contracts/intent';
import type { RuleTemplate } from '../contracts/scenario';
import type { Store } from './store';

export type Outcome = 'clean' | 'amended' | 'vetoed' | 'escalated' | 'expired' | 'drill';

type AgentTrust = { streak: number; clean: number; total: number };
type TrustState = { agents: Record<string, AgentTrust>; offered: string[]; accepted: string[] };

/**
 * Agent trust rings (C17). A ring fills as an agent's proposals pass without
 * amendment; amendments, vetoes and expiries reset the streak. At the
 * threshold Cyclone offers a rule; once the user drops it on the agent,
 * matching intents auto-execute and auto-seal.
 */
export class TrustBook {
  static readonly THRESHOLD = 3;
  private state: TrustState;

  constructor(
    private readonly store: Store,
    private readonly rules: RuleTemplate[],
  ) {
    this.state = store.read<TrustState>('trust', { agents: {}, offered: [], accepted: [] });
  }

  private agent(id: string): AgentTrust {
    return (this.state.agents[id] ??= { streak: 0, clean: 0, total: 0 });
  }

  /** Ring fill 0..1. */
  ring(agentId: string): number {
    return Math.min(1, this.agent(agentId).streak / TrustBook.THRESHOLD);
  }

  stats(agentId: string): Readonly<AgentTrust> {
    return this.agent(agentId);
  }

  /** Record an outcome; returns a newly offered rule when the ring fills. */
  record(intent: HeldIntent, outcome: Outcome): RuleTemplate | null {
    if (outcome === 'drill' || outcome === 'escalated') return null;
    const a = this.agent(intent.agent.id);
    a.total += 1;
    if (outcome === 'clean') {
      a.streak += 1;
      a.clean += 1;
    } else {
      a.streak = 0;
    }
    let offer: RuleTemplate | null = null;
    if (a.streak >= TrustBook.THRESHOLD) {
      offer =
        this.rules.find(
          (r) =>
            r.agent_id === intent.agent.id &&
            !this.state.offered.includes(r.id) &&
            !this.state.accepted.includes(r.id),
        ) ?? null;
      if (offer) this.state.offered.push(offer.id);
    }
    this.save();
    return offer;
  }

  /** Rules offered but not yet accepted (still lying on the desk). */
  pending(): RuleTemplate[] {
    return this.rules.filter(
      (r) => this.state.offered.includes(r.id) && !this.state.accepted.includes(r.id),
    );
  }

  accepted(): RuleTemplate[] {
    return this.rules.filter((r) => this.state.accepted.includes(r.id));
  }

  accept(ruleId: string, agentId: string): boolean {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (!rule || rule.agent_id !== agentId || this.state.accepted.includes(ruleId)) return false;
    this.state.accepted.push(ruleId);
    this.save();
    return true;
  }

  /** The accepted rule that auto-executes this intent, if any. Drills never match. */
  match(intent: HeldIntent): RuleTemplate | null {
    if (intent.is_drill || intent.policy.requires !== 'single') return null;
    for (const r of this.accepted()) {
      if (r.agent_id !== intent.agent.id || r.tool !== intent.tool) continue;
      const v = intent.args[r.param];
      if (typeof v === 'number' && v <= r.max) return r;
    }
    return null;
  }

  reset(): void {
    this.state = { agents: {}, offered: [], accepted: [] };
    this.store.remove('trust');
  }

  private save(): void {
    this.store.write('trust', this.state);
  }
}
