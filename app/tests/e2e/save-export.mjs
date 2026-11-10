import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export default async function run({ frame, workspaceRoot }) {
  const data = await frame.evaluate(() => window.cycloneExport);
  if (!data?.dossier_payload || !data.keys?.length) throw Error('No UI export captured');
  const dir = resolve(workspaceRoot, '../docs/revision1');
  writeFileSync(resolve(dir, 'demo-dossier.json'), JSON.stringify(data.dossier_payload, null, 2));
  writeFileSync(resolve(dir, 'demo-jwks.json'), JSON.stringify({ keys: data.keys }, null, 2));
  return { source: data.source, artifacts: data.dossier_payload.integrity.proof_bundle.artifacts.length, publicKeys: data.keys.length };
}
