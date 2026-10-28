import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Config, RELAY_ROOT } from '../src/config';
import { Upstream } from '../src/upstream';
import { Verifier } from '../src/verify';
import { CORPUS_JWKS, DOSSIERS, FakeClock, MockGate, fixture } from './rig';

const corpus = JSON.parse(readFileSync(CORPUS_JWKS, 'utf8'));
const NAMES = ['allow', 'block', 'escalate', 'owned-execution-bound', 'runtime-signals'];
const at = '2026-11-10T09:00:00.000Z';
const BRAND = /decionis|agent[\s_-]?safe/i;

describe('dossier verification (C39, AGENTS §8.3)', () => {
  it('recorded corpus dossiers: signatures and coverage verify, but the corpus key is not the official anchor → unverified seal', () => {
    for (const name of NAMES) {
      const f = fixture(name);
      const c = Verifier.assess(f, corpus, CORPUS_JWKS, at);
      expect(c.signatures, name).toBe(true);
      expect(c.result?.verified, name).toBe(f.expected.verified);
      expect(c.verification.required_artifact_coverage_verified, name).toBe(true);
      expect(c.verification.trust_anchor, name).not.toBe('DECIONIS_OFFICIAL');
      expect(c.verification.trust_anchor, name).toBe('UNESTABLISHED');
      expect(c.verification.verified, name).toBe(false);
      expect(c.verification.assurance_scope_summary).toMatch(/^Signatures valid · coverage complete · key source not the official anchor\. Established: evaluation/);
    }
  });

  it('issuer tier is honest: an owned claim under a non-official key stays unestablished', () => {
    const owned = Verifier.assess(fixture('owned-execution-bound'), corpus, CORPUS_JWKS, at);
    expect(owned.verification.issuer_tier).toBe('owned workspace (claim unestablished)');
    const plain = Verifier.assess(fixture('allow'), corpus, CORPUS_JWKS, at);
    expect(plain.verification.issuer_tier).toBe('not stated');
  });

  it('tampered dossier → signatures fail → unverified', () => {
    const f = fixture('allow');
    f.dossier_payload.portable_artifact.machine_readable.execution_eligible = false;
    const c = Verifier.assess(f, corpus, CORPUS_JWKS, at);
    expect(c.signatures).toBe(false);
    expect(c.verification.verified).toBe(false);
    expect(c.verification.assurance_scope_summary).toMatch(/^Signatures invalid/);
  });

  it('wrong JWKS → unverified', () => {
    const other = { keys: [{ ...corpus.keys[0], x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }] };
    for (const jwks of [other, { keys: [] }]) {
      const c = Verifier.assess(fixture('escalate'), jwks, Config.PINNED_JWKS, at);
      expect(c.signatures).toBe(false);
      expect(c.verification.verified).toBe(false);
    }
  });

  it('missing coverage (execution binding left out of the proof bundle) → unverified even though signatures verify', () => {
    const f = fixture('allow');
    const bundle = f.dossier_payload.integrity.proof_bundle;
    bundle.artifacts = bundle.artifacts.filter((a: { artifact_kind: string }) => a.artifact_kind !== 'execution_binding');
    const c = Verifier.assess(f, corpus, Config.PINNED_JWKS, at);
    expect(c.signatures).toBe(true);
    expect(c.verification.required_artifact_coverage_verified).toBe(false);
    expect(c.verification.trust_anchor).toBe('DECIONIS_OFFICIAL');
    expect(c.verification.verified).toBe(false);
  });

  it('only all three together verify: valid signatures + coverage + keys served from the pinned URL (mocked fetch)', async () => {
    const gate = new MockGate();
    const clock = new FakeClock();
    const upstream = new Upstream({ base: 'https://api.decionis.com', apiKey: null, orgId: null, fetch: gate.fetch });
    const v = Verifier.forConfig(Config.defaults({ now: clock.now }), upstream);
    expect(v.source).toBe('https://api.decionis.com/.well-known/decision-dossier-jwks.json');
    const c = await v.check(fixture('allow'), 'synthetic-dossier-allow-001');
    expect(c.verification).toMatchObject({ verified: true, required_artifact_coverage_verified: true, trust_anchor: 'DECIONIS_OFFICIAL' });
    // cached: one JWKS fetch for two checks
    await v.check(fixture('escalate'));
    expect(gate.seen.filter((s) => s.url.endsWith('decision-dossier-jwks.json'))).toHaveLength(1);
    // a dossier id other than the one asked for never verifies
    expect((await v.check(fixture('allow'), 'some-other-id')).verification.verified).toBe(false);
  });

  it('unavailable dossier or keys seal as unverified; text reaching the headset is brand-free', async () => {
    const none = Verifier.unavailable('Decionis AgentSafe unreachable', at);
    expect(none.verification).toMatchObject({ verified: false, trust_anchor: 'UNAVAILABLE' });
    expect(none.verification.assurance_scope_summary).not.toMatch(BRAND);
    const broken = new Verifier('https://api.decionis.com/.well-known/decision-dossier-jwks.json', async () => {
      throw new Error('offline');
    }, () => 0);
    expect((await broken.check(fixture('allow'))).verification.verified).toBe(false);
    for (const name of NAMES) {
      const v = Verifier.assess(fixture(name), corpus, CORPUS_JWKS, at).verification;
      expect(v.assurance_scope_summary).not.toMatch(BRAND);
      expect(v.issuer_tier).not.toMatch(BRAND);
    }
  });

  it('CLI cross-check: npx @decionis/verify exits 0 on a valid fixture and 1 on a tampered one', () => {
    const cli = join(RELAY_ROOT, 'node_modules/.bin/decionis-verify');
    const run = (file: string) => {
      try {
        execFileSync(cli, ['--file', file, '--jwks', CORPUS_JWKS], { stdio: 'pipe' });
        return 0;
      } catch (err) {
        return (err as { status: number }).status;
      }
    };
    expect(run(join(DOSSIERS, 'allow.json'))).toBe(0);
    const tampered = fixture('allow');
    tampered.dossier_payload.portable_artifact.machine_readable.verdict = 'BLOCK';
    const file = join(mkdtempSync(join(tmpdir(), 'cyclone-')), 'tampered.json');
    writeFileSync(file, JSON.stringify(tampered));
    expect(run(file)).toBe(1);
  });
});
