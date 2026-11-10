import type { HeldIntent } from '../contracts/intent';
import type { RuleTemplate } from '../contracts/scenario';
import type { Store } from './store';

export type Outcome = 'clean' | 'amended' | 'vetoed' | 'escalated' | 'expired' | 'drill';
type AgentTrust = { streak: number; clean: number; total: number };
type Grant = { status: 'offered' | 'accepted' | 'revoked'; expiresAt: number };
type TrustState = { version: 2; agents: Record<string, AgentTrust>; grants: Record<string, Grant> };

/** Bounded demo delegation. A ring is progression, never statistical proof of safety. */
export class TrustBook {
  static readonly THRESHOLD = 3;
  private state: TrustState;
  constructor(private readonly store: Store, private readonly rules: RuleTemplate[], private readonly now = Date.now) {
    const saved = store.read<TrustState | null>('trust', null);
    // Legacy broad grants retain no authority; preserve their source for inspection.
    if (saved && saved.version !== 2) store.write('trustLegacy', saved);
    this.state = saved?.version === 2 ? saved : { version: 2, agents: {}, grants: {} };
  }
  private agent(id: string): AgentTrust { return (this.state.agents[id] ??= { streak: 0, clean: 0, total: 0 }); }
  ring(agentId: string): number { return Math.min(1, this.agent(agentId).streak / TrustBook.THRESHOLD); }
  stats(agentId: string): Readonly<AgentTrust> { return this.agent(agentId); }
  private valid(r: RuleTemplate): boolean {
    return !!r.asset_id && !!r.unit && r.risk === 0 && r.requires === 'single' &&
      Number.isFinite(r.min) && Number.isFinite(r.max) && r.min >= 0 && r.min <= r.max &&
      Number.isFinite(r.lifetime_s) && r.lifetime_s > 0 && r.lifetime_s <= 86400;
  }
  record(intent: HeldIntent, outcome: Outcome): RuleTemplate | null {
    if (outcome === 'drill' || outcome === 'escalated') return null;
    const a = this.agent(intent.agent.id); a.total++;
    if (outcome === 'clean') { a.streak++; a.clean++; } else a.streak = 0;
    const offer = a.streak >= TrustBook.THRESHOLD
      ? this.rules.find(r => r.agent_id === intent.agent.id && this.valid(r) && !this.state.grants[r.id]) ?? null : null;
    if (offer) this.state.grants[offer.id] = { status: 'offered', expiresAt: this.now() + offer.lifetime_s * 1000 };
    this.save(); return offer;
  }
  status(id: string): 'not offered' | 'offered' | 'accepted' | 'expired' | 'revoked' {
    const g = this.state.grants[id];
    return !g ? 'not offered' : g.status === 'revoked' ? 'revoked' : g.expiresAt <= this.now() ? 'expired' : g.status;
  }
  pending(): RuleTemplate[] { return this.rules.filter(r => this.valid(r) && this.status(r.id) === 'offered'); }
  accepted(): RuleTemplate[] { return this.rules.filter(r => this.valid(r) && this.status(r.id) === 'accepted'); }
  accept(ruleId: string, agentId: string): boolean {
    const rule = this.pending().find(r => r.id === ruleId && r.agent_id === agentId);
    if (!rule) return false;
    this.state.grants[ruleId].status = 'accepted'; this.save(); return true;
  }
  revoke(ruleId: string): boolean {
    const g = this.state.grants[ruleId];
    if (!g || g.status === 'revoked') return false;
    g.status = 'revoked'; this.save(); return true;
  }
  expiresAt(ruleId: string): number | null { return this.state.grants[ruleId]?.expiresAt ?? null; }
  match(intent: HeldIntent): RuleTemplate | null {
    if (intent.is_drill || intent.policy.requires !== 'single' || intent.risk.level !== 0) return null;
    for (const r of this.accepted()) {
      if (r.agent_id !== intent.agent.id || r.tool !== intent.tool || r.asset_id !== intent.target.asset_id ||
        intent.amend?.param !== r.param || intent.amend?.unit !== r.unit) continue;
      const value = intent.args[r.param];
      if (typeof value === 'number' && Number.isFinite(value) && value >= r.min && value <= r.max) return r;
    }
    return null;
  }
  reset(): void { this.state = { version: 2, agents: {}, grants: {} }; this.store.remove('trust'); }
  private save(): void { this.store.write('trust', this.state); }
}
