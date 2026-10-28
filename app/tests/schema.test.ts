import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { heldIntentSchema, scenarioSchema } from '../src/contracts/schema';
import type { Cast, ScenarioFile } from '../src/contracts/scenario';
import { Clock } from '../src/core/clock';
import { Glyph } from '../src/core/glyph';
import { Rng } from '../src/core/rng';
import { IntentFactory } from '../src/scenario/factory';
import cast from '../src/scenario/agents.json';
import onboarding from '../src/scenario/onboarding.json';
import handover from '../src/scenario/handover.json';
import drills from '../src/scenario/drills.json';
import twin from '../src/scenario/twin.json';

const ajv = new Ajv({ allErrors: true, strict: false });
const scenarios = [onboarding, handover, drills] as ScenarioFile[];

describe('contracts (C32, C38)', () => {
  it('every scenario file validates against the scenario schema', () => {
    const validate = ajv.compile(scenarioSchema);
    for (const s of scenarios) {
      const ok = validate(s);
      expect(validate.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
    }
  });

  it('every generated HeldIntent validates against the §5.1 schema', async () => {
    const validate = ajv.compile(heldIntentSchema);
    const factory = new IntentFactory(cast as Cast, new Clock(), new Rng(1));
    for (const s of scenarios) {
      for (const t of s.templates) {
        const intent = await factory.build(t);
        expect(validate(intent), JSON.stringify(validate.errors)).toBe(true);
      }
    }
  });

  it('templates reference known agents, assets, and beats reference known templates', () => {
    const agents = new Set((cast as Cast).agents.map((a) => a.id));
    const assets = new Set(twin.assets.map((a) => a.id));
    for (const s of scenarios) {
      const keys = new Set(s.templates.map((t) => t.key));
      for (const t of s.templates) {
        expect(agents.has(t.agent_id)).toBe(true);
        expect(assets.has(t.target.asset_id)).toBe(true);
      }
      for (const b of s.beats) {
        expect(keys.has(b.template)).toBe(true);
        if (b.after) expect(keys.has(b.after)).toBe(true);
      }
    }
  });

  it('onboarding holds exactly the four brief intents with their policy and risk (C32)', () => {
    const o = onboarding as ScenarioFile;
    const beats = o.beats.map((b) => o.templates.find((t) => t.key === b.template)!);
    expect(beats.map((t) => [t.tool, t.policy.requires, t.risk.level, !!t.is_drill])).toEqual([
      ['set_conveyor_speed', 'single', 0, false],
      ['set_arm_velocity', 'two_hand', 2, false],
      ['set_oven_setpoint', 'forbidden', 3, false],
      ['lift_pallet', 'single', 0, true],
    ]);
    expect(beats[0].args.speed_pct).toBe(10);
    expect(beats[1].args.deg_s).toBe(250);
    expect(beats[1].amend?.safe_max).toBe(180);
    expect(beats[2].args.setpoint_c).toBe(450);
  });
});

describe('glyph (C10)', () => {
  it('is deterministic from the first 8 bytes and differs for different hashes', () => {
    const a = Glyph.from('sha256:' + '3f'.repeat(32));
    const b = Glyph.from('sha256:' + '3f'.repeat(32));
    const c = Glyph.from('sha256:' + '3e' + '3f'.repeat(31));
    expect(a.equals(b)).toBe(true);
    expect(a.segments).toEqual(b.segments);
    expect(a.equals(c)).toBe(false);
    expect(a.segments.length).toBeGreaterThan(0);
    expect(() => Glyph.from('nope')).toThrow();
  });
});
