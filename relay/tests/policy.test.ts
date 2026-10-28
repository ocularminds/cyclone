import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { IntentBinding } from '../../app/src/contracts/intent';
import { Clock } from '../../app/src/core/clock';
import { Rng } from '../../app/src/core/rng';
import { IntentFactory } from '../../app/src/scenario/factory';
import { Config } from '../src/config';
import { PolicyBook } from '../src/policy';
import { cast, onboarding, template } from './rig';

const book = PolicyBook.load(Config.defaults().policyPath);
const bundle = JSON.parse(readFileSync(Config.defaults().policyPath, 'utf8'));
const factory = new IntentFactory(cast, new Clock(Date.UTC(2026, 10, 10)), new Rng(3));

function binding(tool: string, params: Record<string, unknown>, resource = 'x'): IntentBinding {
  const t = { ...template('conveyor'), tool, args: params, target: { asset_id: resource } };
  return factory.binding(t, new Rng(5).uuid(), 240);
}
const verdict = (b: IntentBinding, approval?: Record<string, unknown>) => {
  const v = book.evaluate(PolicyBook.facts(b, approval));
  return [v.rule?.rule_id, v.status];
};
const approval = (method: string) => ({ provider: 'attestation', result: 'VERIFIED', approver_role: 'CYCLONE_OPERATOR', method });

describe('Cyclone policy bundle (C48, docs/agentsafe.md §4)', () => {
  it('has the documented bundle and rule shape', () => {
    expect(bundle.protocol_version).toMatch(/^1\./);
    expect(bundle.bundle_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    for (const k of ['org_id', 'version', 'effective_from']) expect(typeof bundle[k]).toBe('string');
    expect(bundle.version.length).toBeLessThanOrEqual(100);
    const ruleKeys = new Set(['rule_id', 'name', 'decision_domain', 'when', 'then', 'priority', 'enabled', 'rationale']);
    const thenKeys = new Set(['action', 'severity', 'assignee_role', 'sla_minutes', 'authority']);
    const authKeys = new Set(['reason_codes', 'selector', 'verification_requirements', 'resolution', 'expires_in_seconds']);
    expect(bundle.rules.length).toBeGreaterThan(0);
    for (const r of bundle.rules) {
      for (const k of Object.keys(r)) expect(ruleKeys.has(k), `${r.rule_id}.${k}`).toBe(true);
      for (const k of Object.keys(r.then)) expect(thenKeys.has(k), `${r.rule_id}.then.${k}`).toBe(true);
      expect(['REQUIRE_REVIEW', 'AUTO_APPROVE', 'AUTO_REJECT', 'ESCALATE', 'REQUEST_INFO']).toContain(r.then.action);
      if (r.then.severity) expect(['routine', 'elevated', 'urgent']).toContain(r.then.severity);
      if (r.then.authority) {
        for (const k of Object.keys(r.then.authority)) expect(authKeys.has(k)).toBe(true);
        const s = r.then.authority.expires_in_seconds;
        if (s !== undefined) expect(s >= 60 && s <= 3600).toBe(true);
        if (r.then.authority.selector) expect(r.then.authority.selector.kind).toBe('ROLE');
      }
      // every hold/refusal has a desk mapping
      if (r.then.action !== 'AUTO_APPROVE') expect(book.mapping.rules[r.rule_id], r.rule_id).toBeDefined();
    }
  });

  it('decides the four scenarios as the brief says (BRIEF §7)', () => {
    expect(verdict(binding('set_conveyor_speed', { line: 1, speed_pct: 10 }))).toEqual(['conveyor.speed.small_change', 'ESCALATE']);
    expect(verdict(binding('set_conveyor_speed', { line: 1, speed_pct: 11 }))).toEqual(['conveyor.speed.large_change', 'BLOCK']);
    expect(verdict(binding('set_arm_velocity', { cell: 3, joint: 'axis_3', deg_s: 250 }))).toEqual(['arm.velocity.walkway_adjacent', 'ESCALATE']);
    expect(verdict(binding('set_arm_velocity', { cell: 3, joint: 'axis_3', deg_s: 320 }))).toEqual(['arm.velocity.hard_max', 'BLOCK']);
    expect(verdict(binding('set_oven_setpoint', { zone: 'B', setpoint_c: 450 }))).toEqual(['oven.setpoint.hard_limit', 'BLOCK']);
    expect(verdict(binding('set_oven_setpoint', { zone: 'B', setpoint_c: 400 }))).toEqual(['oven.setpoint.within_limit', 'ESCALATE']);
    expect(verdict(binding('lift_pallet', { lift: 2, pallet: 'P-14', bay: 'S2-3', height_mm: 1150 }))).toEqual(['lift.routine', 'ESCALATE']);
    expect(verdict(binding('lift_pallet', { lift: 2, height_mm: 1600 }))).toEqual(['lift.height.envelope', 'BLOCK']);
    expect(verdict(binding('open_valve', { v: 1 }))).toEqual(['cyclone.default.hold', 'ESCALATE']);
  });

  it('a human approval turns the hold into ALLOW only with the right gesture, and never past a hard limit', () => {
    const arm = binding('set_arm_velocity', { cell: 3, joint: 'axis_3', deg_s: 250 });
    expect(verdict(arm, approval('two_hand_hold'))).toEqual(['cyclone.approval.two_hand', 'ALLOW']);
    expect(verdict(arm, approval('place'))).toEqual(['arm.velocity.walkway_adjacent', 'ESCALATE']);
    expect(verdict(binding('set_conveyor_speed', { speed_pct: 10 }), approval('place'))).toEqual(['cyclone.approval.single', 'ALLOW']);
    expect(verdict(binding('set_oven_setpoint', { zone: 'B', setpoint_c: 450 }), approval('place'))).toEqual(['oven.setpoint.hard_limit', 'BLOCK']);
  });

  it('presents every onboarding template exactly as the demo scenario does (rule, requirement, risk)', () => {
    for (const t of onboarding.templates) {
      const b = factory.binding(t, new Rng(9).uuid(), 240);
      const status = book.evaluate(PolicyBook.facts(b)).status;
      const p = book.present(b, status);
      expect([t.key, p.policy.rule_id, p.policy.requires, p.risk.level]).toEqual([t.key, t.policy.rule_id, t.policy.requires, t.risk.level]);
      if (t.amend?.safe_max) expect(p.amend?.safe_max).toBe(t.amend.safe_max);
    }
  });

  it('the policy gate’s stricter verdict always wins; ALLOW is not held', () => {
    const arm = binding('set_arm_velocity', { cell: 3, joint: 'axis_3', deg_s: 180 });
    expect(book.present(arm, 'BLOCK').policy.requires).toBe('forbidden');
    expect(book.present(arm, 'REVIEW_REQUIRED').policy.requires).toBe('forbidden');
    expect(book.present(arm, 'ESCALATE').policy.requires).toBe('two_hand');
    expect(() => book.present(arm, 'ALLOW')).toThrow(/not held/);
  });

  it('amendment ceiling: arm down to 180°/s is fine, above is denied; only the dial parameter may change', () => {
    const b = binding('set_arm_velocity', { cell: 3, joint: 'axis_3', deg_s: 250 }, 'arm-cell-3');
    const intent = {
      intent_id: b.intent_id,
      agent: { id: 'cell-agent', label: 'Cell Agent' },
      tool: 'set_arm_velocity',
      args: { cell: 3, joint: 'axis_3', deg_s: 250 },
      target: { asset_id: 'arm-cell-3' },
      ...book.present(b, 'ESCALATE'),
      expires_at: b.expires_at,
      intent_hash: 'sha256:x',
    };
    expect(book.amendment(intent, b, { cell: 3, joint: 'axis_3', deg_s: 180 })).toBeNull();
    expect(book.amendment(intent, b, { cell: 3, joint: 'axis_3', deg_s: 190 })).toMatch(/ceiling is 180/);
    expect(book.amendment(intent, b, { cell: 3, joint: 'axis_3', deg_s: 50 })).toMatch(/outside/);
    expect(book.amendment(intent, b, { cell: 4, joint: 'axis_3', deg_s: 180 })).toMatch(/Only deg_s/);
    expect(book.amendment(intent, b, { cell: 3, joint: 'axis_3' })).toMatch(/number/);
  });
});
