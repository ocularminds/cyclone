import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Config } from '../src/config';
import { Fixtures } from '../src/record';
import { FakeClock, MockGate, decide, handoff, hold, live, relay, webhook } from './rig';

describe('C49 recorded fixtures', () => {
  it('check:fixtures passes trivially with no recordings and says so (the shipped state)', async () => {
    const res = await new Fixtures().check();
    expect(res.ok).toBe(true);
    expect(res.lines.join('\n')).toMatch(/No recorded fixtures yet/);
  });

  it('records a live run, exports only verified records to the fixtures shape, and fails the check on a tampered dossier', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cyclone-rec-'));
    const out = join(dir, 'fixtures.json');
    writeFileSync(out, JSON.stringify({ note: 'x', records: [] }));
    const clock = new FakeClock();
    const gate = new MockGate();
    // Keys served from the pinned URL (mocked fetch) so the run's seals verify as official.
    const r = await relay(live(clock, { recordDir: dir, jwks: { url: Config.PINNED_JWKS, file: null } }), gate);
    const h = await handoff('conveyor', clock);
    const intent = await hold(r, h);
    await webhook(r, {
      event_name: 'authority.escalation_required',
      intent_id: h.binding.intent_id,
      intent_hash: h.intent_hash,
      tenant_id: h.binding.tenant_id,
      dossier_id: 'synthetic-dossier-escalate-001',
    });
    const rec = (await decide(r, intent, { decision: 'APPROVE', gesture: 'place' })).json();
    expect(rec.verification.verified).toBe(true);
    await r.close();

    const folder = join(dir, h.binding.intent_id.replace(/-/g, ''));
    for (const f of ['handoff.json', 'webhooks.json', 'approve.json', 'dossier.json']) expect(existsSync(join(folder, f)), f).toBe(true);
    await vi.waitFor(() => expect(existsSync(join(dir, 'jwks.json'))).toBe(true));

    const fixtures = new Fixtures(dir, out, gate.fetch);
    const exported = await fixtures.export();
    expect(exported.written).toBe(1);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(Object.keys(written)).toEqual(['note', 'records']);
    expect(written.records[0]).toMatchObject({ intent_id: intent.intent_id, source: 'live', verification: { verified: true, trust_anchor: 'DECIONIS_OFFICIAL' } });
    expect(written.records[0].relay).toBeUndefined();
    expect((await fixtures.check()).ok).toBe(true);

    const approve = JSON.parse(readFileSync(join(folder, 'approve.json'), 'utf8'));
    approve.dossier.portable_artifact.machine_readable.verdict = 'BLOCK';
    writeFileSync(join(folder, 'approve.json'), JSON.stringify(approve));
    const bad = await fixtures.check();
    expect(bad.ok).toBe(false);
    expect(bad.lines.some((l) => l.startsWith('FAIL recorded'))).toBe(true);
  });
});
