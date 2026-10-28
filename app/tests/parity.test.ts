import { intentHash, stableJsonStringify, verifyIntentVector } from '@decionis/verify';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Clock } from '../src/core/clock';
import { Canon } from '../src/core/canon';
import { IntentHasher } from '../src/core/hash';
import { Rng } from '../src/core/rng';
import { IntentFactory } from '../src/scenario/factory';
import cast from '../src/scenario/agents.json';
import onboarding from '../src/scenario/onboarding.json';
import handover from '../src/scenario/handover.json';
import drills from '../src/scenario/drills.json';
import type { Cast, ScenarioFile } from '../src/contracts/scenario';

const VECTORS = join(__dirname, '../../relay/src/fixtures/vectors');

function vectorFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? vectorFiles(p) : name.endsWith('.json') ? [p] : [];
  });
}

async function expectParity(value: unknown) {
  const ref = intentHash(value);
  const port = await IntentHasher.hash(value);
  expect(port.canonical_json).toBe(ref.canonical_json);
  expect(port.intent_hash).toBe(ref.intent_hash);
  expect(Canon.stringify(value)).toBe(stableJsonStringify(value));
}

describe('Agent-Safe Intent v1 browser port parity (C13)', () => {
  const scenarios = [onboarding, handover, drills] as ScenarioFile[];
  const factory = new IntentFactory(cast as Cast, new Clock(Date.UTC(2026, 10, 1)), new Rng(7));

  it('matches intentHash() for every scenario binding and its amended mutation', async () => {
    let n = 0;
    for (const s of scenarios) {
      for (const t of s.templates) {
        const intent = await factory.build(t);
        await expectParity(intent.binding);
        expect(intent.intent_hash).toBe(intentHash(intent.binding).intent_hash);
        expect(verifyIntentVector({ binding: intent.binding, intent_hash: intent.intent_hash }).ok).toBe(true);
        if (t.amend) {
          const amended = IntentHasher.amend(intent.binding!, {
            ...t.args,
            [t.amend.param]: t.amend.min,
          });
          await expectParity(amended);
          expect(intentHash(amended).intent_hash).not.toBe(intent.intent_hash);
        }
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(8);
  });

  it('matches on edge cases: key order, nesting, unicode, numbers, arrays', async () => {
    const cases: unknown[] = [
      { b: 1, a: 2, A: 3, _: 4, '10': 5, '9': 6 },
      { nested: { z: [3, { y: 1, x: 2 }], a: null }, list: [{ b: 1, a: 1 }] },
      { text: 'Zone B — 450 °C · ünïcødé 🌀', esc: '"quote" \\ \n\t\u0001', lone: '\ud800' },
      { n: [0, -0, 1e21, 1e-7, 0.1 + 0.2, 123456789012345680000, -1.5e-10, 2 ** 53] },
      { emoji: { '🌀': 1, '\u00e9': 2, e: 3, 'e\u0301': 4 } },
      { deep: { a: { b: { c: { d: { e: { f: [[[1]]] } } } } } } },
      { empty: {}, arr: [], s: '', t: true, f: false },
    ];
    for (const c of cases) await expectParity(c);
  });

  it('raises the same error codes as the reference', async () => {
    const bad: unknown[] = [
      [],
      'x',
      { n: Infinity },
      { ['__proto__']: 1 },
      JSON.parse('{"__proto__": {"a": 1}}'),
      { a: new Array(1001).fill(0) },
      { s: 'x'.repeat(110 * 1024) },
      (() => {
        let o: Record<string, unknown> = { v: 1 };
        for (let i = 0; i < 22; i++) o = { o };
        return o;
      })(),
    ];
    for (const b of bad) {
      let refErr = '';
      let portErr = '';
      try {
        intentHash(b);
      } catch (e) {
        refErr = (e as Error).message;
      }
      try {
        await IntentHasher.hash(b);
      } catch (e) {
        portErr = (e as Error).message;
      }
      expect(portErr).toBe(refErr);
    }
  });

  const files = vectorFiles(VECTORS);
  it('has the published conformance corpus checked in', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slice(VECTORS.length + 1), f]))('conformance vector %s', async (_name, file) => {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    const ref = verifyIntentVector(doc);
    const binding = doc && typeof doc === 'object' && doc.binding ? doc.binding : doc;
    let port: { canonical_json: string; intent_hash: string } | null = null;
    try {
      port = await IntentHasher.hash(binding);
    } catch {
      port = null;
    }
    expect(port?.canonical_json ?? null).toBe(ref.canonical_json);
    expect(port?.intent_hash ?? null).toBe(ref.intent_hash);
    for (const m of Array.isArray(doc?.mutations) ? doc.mutations : []) {
      if (!m || typeof m !== 'object' || !m.binding) continue;
      let refM: string | null = null;
      try {
        refM = intentHash(m.binding).intent_hash;
      } catch {
        refM = null;
      }
      let portM: string | null = null;
      try {
        portM = (await IntentHasher.hash(m.binding)).intent_hash;
      } catch {
        portM = null;
      }
      expect(portM).toBe(refM);
    }
  });
});
