import { readFileSync } from 'node:fs';
import type { AmendSpec, HeldIntent, IntentBinding, Requirement, RiskLevel } from '../../app/src/contracts/intent';
import { Json, RelayError } from './errors';
import type { GrantStatus } from './upstream';

/** docs/agentsafe.md §4: `PolicyRule` (OAS, additionalProperties false). */
export type Condition = { field: string; operator: string; value?: unknown };
export type ThenAction = 'AUTO_APPROVE' | 'REQUIRE_REVIEW' | 'AUTO_REJECT' | 'ESCALATE' | 'REQUEST_INFO';
export type PolicyRule = {
  rule_id: string;
  name: string;
  decision_domain: string;
  when: { all?: Condition[] };
  then: { action: ThenAction; [key: string]: unknown };
  priority: number;
  enabled: boolean;
  rationale?: string;
};

type RiskBand = { param?: string; lte?: number; level: RiskLevel; reasons: string[] };
type Presentation = { requires: Requirement; risk: RiskBand[]; amend?: AmendSpec };
type Mapping = {
  approver_role: string;
  actions: Record<ThenAction, GrantStatus>;
  statuses: Record<GrantStatus, 'not_held' | 'rule' | 'forbidden'>;
  rules: Record<string, Presentation>;
};

export type Presented = Pick<HeldIntent, 'policy' | 'risk'> & { amend?: AmendSpec };

/**
 * Reads policy/cyclone.json: the documented bundle (docs/agentsafe.md §4) plus
 * Cyclone's presentation mapping in `metadata.cyclone`. The relay evaluates the
 * bundle locally only to present a held intent (gesture requirement, risk,
 * amend dial) and to pre-check amendments; the policy gate's own verdict is
 * authoritative and always wins when it is stricter (fail closed).
 * Evaluation follows docs/agentsafe.md §4 (PX): enabled rules, highest
 * priority first, the first rule whose conditions all hold decides.
 */
export class PolicyBook {
  readonly rules: PolicyRule[];
  readonly mapping: Mapping;

  constructor(readonly bundle: Record<string, unknown>) {
    const rules = bundle.rules;
    const meta = Json.isObject(bundle.metadata) ? bundle.metadata.cyclone : undefined;
    if (!Array.isArray(rules) || rules.length === 0) throw new Error('Policy bundle has no rules');
    if (!Json.isObject(meta)) throw new Error('Policy bundle lacks metadata.cyclone mapping');
    this.rules = (rules as PolicyRule[]).filter((r) => r.enabled).sort((a, b) => b.priority - a.priority);
    this.mapping = meta as unknown as Mapping;
  }

  static load(path: string): PolicyBook {
    return new PolicyBook(JSON.parse(readFileSync(path, 'utf8')));
  }

  /** Facts a rule sees: the binding, with `decision_type` = `action.type` (Intent v1 spec §3). */
  static facts(binding: IntentBinding, humanApproval?: Record<string, unknown>): Record<string, unknown> {
    return {
      ...binding,
      decision_type: binding.action.type,
      ...(humanApproval ? { agent_safe: { human_approval: humanApproval } } : {}),
    };
  }

  /** First matching rule and the grant status its `then.action` stands for. */
  evaluate(facts: Record<string, unknown>): { rule: PolicyRule | null; status: GrantStatus } {
    for (const rule of this.rules) {
      const all = rule.when.all ?? [];
      if (all.every((c) => PolicyBook.holds(c, facts))) {
        return { rule, status: this.mapping.actions[rule.then.action] ?? 'REVIEW_REQUIRED' };
      }
    }
    return { rule: null, status: 'REVIEW_REQUIRED' };
  }

  /** The supported operator subset; anything unknown does not hold. */
  static holds(c: Condition, facts: Record<string, unknown>): boolean {
    const v = PolicyBook.read(facts, c.field);
    switch (c.operator) {
      case 'EXISTS':
        return v !== undefined && v !== null;
      case 'in':
        return Array.isArray(c.value) && c.value.some((x) => x === v);
      case 'lte':
        return typeof v === 'number' && typeof c.value === 'number' && v <= c.value;
      case 'gt':
        return typeof v === 'number' && typeof c.value === 'number' && v > c.value;
      default:
        return false;
    }
  }

  static read(facts: Record<string, unknown>, path: string): unknown {
    let cur: unknown = facts;
    for (const part of path.split('.')) {
      if (!Json.isObject(cur)) return undefined;
      cur = cur[part];
    }
    return cur;
  }

  /**
   * How a held intent appears on the desk. `status` is the policy gate's verdict;
   * a BLOCK (or any non-ESCALATE hold) is always `forbidden`, whatever the local
   * evaluation says. An ALLOW is not held.
   */
  present(binding: IntentBinding, status: GrantStatus): Presented {
    const route = this.mapping.statuses[status] ?? 'forbidden';
    if (route === 'not_held') throw new RelayError(409, 'NOT_HELD', `A ${status} verdict is not held.`);
    const local = this.evaluate(PolicyBook.facts(binding));
    const ruleId = local.rule?.rule_id ?? 'cyclone.default.hold';
    const spec = this.mapping.rules[ruleId] ?? this.mapping.rules['cyclone.default.hold'];
    const band = PolicyBook.band(spec?.risk ?? [], binding.action.parameters);
    let requires: Requirement = spec?.requires ?? 'forbidden';
    let risk = { level: band.level, reasons: [...band.reasons] };
    const stricter = route === 'forbidden' || local.status === 'BLOCK' || local.status === 'ALLOW';
    if (stricter && requires !== 'forbidden') {
      requires = 'forbidden';
      risk = {
        level: 3,
        reasons: [local.status === 'ALLOW' ? 'Policy mismatch: the desk cannot approve this hold' : 'The policy gate refused this action'],
      };
    }
    const out: Presented = { policy: { rule_id: ruleId, requires }, risk };
    if (requires !== 'forbidden' && spec?.amend) out.amend = { ...spec.amend };
    return out;
  }

  static band(bands: RiskBand[], params: Record<string, unknown>): RiskBand {
    for (const b of bands) {
      if (b.param === undefined) return b;
      const v = params[b.param];
      if (typeof v === 'number' && b.lte !== undefined && v <= b.lte) return b;
    }
    return { level: 3, reasons: ['No risk mapping for this action'] };
  }

  /**
   * C12 pre-check before any amended approval leaves the relay: only the dial's
   * parameter may change, it must be a number inside [min, safe_max ?? max],
   * and the amended call must not hit a blocking rule. Returns the user-facing
   * denial, or null. Mirrors DemoAdapter.evaluateAmendment.
   */
  amendment(intent: HeldIntent, binding: IntentBinding, args: Record<string, unknown>): string | null {
    const spec = intent.amend;
    if (!spec) return 'This action has no amendable parameter.';
    const keys = new Set([...Object.keys(args), ...Object.keys(intent.args)]);
    for (const key of keys) {
      if (key !== spec.param && args[key] !== intent.args[key]) return `Only ${spec.param} may change.`;
    }
    const v = args[spec.param];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `${spec.param} must be a number.`;
    const ceiling = spec.safe_max ?? spec.max;
    if (v < spec.min || v > ceiling) return `Policy ceiling is ${ceiling}${spec.unit}; ${v}${spec.unit} is outside it.`;
    const amended = { ...binding, action: { ...binding.action, parameters: { ...args } } };
    const verdict = this.evaluate(PolicyBook.facts(amended));
    if (verdict.status === 'BLOCK') return `The policy refuses ${v}${spec.unit} (${verdict.rule?.name ?? 'blocking rule'}).`;
    return null;
  }
}
