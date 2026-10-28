import type { AmendSpec, Requirement, RiskLevel } from './intent';

export type AgentSpec = { id: string; label: string; sigil: 'chevron' | 'ring' | 'wave' };

/** An intent as authored in scenario JSON; the engine fills ids, binding, times and hash. */
export type IntentTemplate = {
  key: string;
  agent_id: string;
  tool: string;
  args: Record<string, unknown>;
  target: { asset_id: string };
  policy: { rule_id: string; requires: Requirement };
  risk: { level: RiskLevel; reasons: string[] };
  summary: string;
  rationale: string;
  ttl_s: number;
  amend?: AmendSpec;
  is_drill?: boolean;
  /** Downstream system/operation for the Intent v1 binding. */
  downstream: { system: string; operation: string };
};

export type Beat = {
  /** Onboarding beat name logged with timestamps (C14). */
  beat: string;
  template: string;
  /** Spawn at this session second, or `after` the named template is decided. */
  at?: number;
  after?: string;
  delay_s?: number;
  /** Optional teaching hints the onboarding system plays for this token. */
  hints?: Array<'glow' | 'pinch' | 'handle' | 'dial' | 'lock' | 'hold' | 'push'>;
};

export type RuleTemplate = {
  id: string;
  agent_id: string;
  tool: string;
  param: string;
  max: number;
  label: string;
};

/** Agents, tenant and offerable trust rules shared by every scenario (agents.json). */
export type Cast = { tenant_id: string; agents: AgentSpec[]; rules: RuleTemplate[] };

export type ScenarioFile = {
  id: string;
  title: string;
  templates: IntentTemplate[];
  beats: Beat[];
  /** Agent re-proposals after a counter-offer (template key → re-proposal template key). */
  counter_offers?: Record<string, string>;
  /** Ends the shift (summary) once every beat is decided. */
  ends_with_summary?: boolean;
};
