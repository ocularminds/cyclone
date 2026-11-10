import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { assessJwksTrustAnchor, verifyDossierProofBundle } from '@decionis/verify';
import { DemoSigner } from '../../app/src/core/signer';
import { Store } from '../../app/src/state/store';
import { bind, FakeClock } from './rig';

it('exports an actual browser-signer demo record in the public CLI proof format (not official authority)', async () => {
  const clock = new FakeClock(), b = await bind('conveyor', clock);
  const signer = new DemoSigner(new Store('demo-export-test.', null));
  const record = await signer.sign({ record_id: 'demo-proof-export', intent_id: b.binding.intent_id,
    intent_hash: b.intent_hash, source: 'demo', tool: b.binding.action.type, asset_id: b.binding.action.resource,
    decision: { decision: 'REJECT', gesture: 'veto_push', intent_id: b.binding.intent_id, intent_hash: b.intent_hash, client_ts: new Date(clock.t).toISOString(), reason: { code: 'user_veto' } },
    rehearsal: { args: b.binding.action.parameters, path_samples_ref: 'rehearsal:unavailable' }, decided_at: new Date(clock.t).toISOString() });
  expect(await signer.verify(record)).toBe(true);
  const exported = await signer.export(record);
  expect(verifyDossierProofBundle({ dossier_payload: exported.dossier_payload as Record<string, unknown>, public_jwks: { keys: exported.keys } }).verified).toBe(true);
  const dir = mkdtempSync(join(tmpdir(), 'cyclone-demo-export-')), path = join(dir, 'demo-dossier.json'), jwks = join(dir, 'demo-jwks.json');
  writeFileSync(path, JSON.stringify(exported)); writeFileSync(jwks, JSON.stringify({ keys: exported.keys }));
  const command = (keyfile: string) => spawnSync(process.execPath, ['node_modules/@decionis/verify/dist/cli.js', '--file', path, '--jwks', keyfile, '--json'], { encoding: 'utf8' });
  expect(command(jwks).status).toBe(0); expect(command(path).status).toBe(0);
  (exported.dossier_payload as any).portable_artifact.intent_hash = 'sha256:' + 'b'.repeat(64);
  writeFileSync(path, JSON.stringify(exported)); expect(command(jwks).status).toBe(1);
  expect(assessJwksTrustAnchor(jwks).trusted).toBe(false);
  expect(assessJwksTrustAnchor(jwks).status).not.toBe('DECIONIS_OFFICIAL');
});
