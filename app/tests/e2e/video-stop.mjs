import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
export default async function run({ frame, workspaceRoot }) {
  const result = await frame.evaluate(async () => {
    const r = window.cycloneRecording; if (!r) throw Error('No recording in this page');
    await new Promise(resolve => { r.recorder.onstop = resolve; r.recorder.stop(); });
    const blob = new Blob(r.chunks, { type: r.recorder.mimeType });
    r.off(); r.synth.master.disconnect(r.audio); for (const track of r.stream.getTracks()) track.stop();
    return { name: r.name, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), events: r.events,
      duration: (performance.now() - r.start) / 1000, size: r.canvas, type: r.recorder.mimeType,
      records: window.cyclone.app.ledger.own().map(x => ({ id: x.record_id, tool: x.tool, decision: x.decision.decision })) };
  });
  const dir = resolve(workspaceRoot, '../docs/revision1/video'); mkdirSync(dir, { recursive: true });
  if(!/^[a-z0-9_-]{1,32}$/.test(result.name)) throw Error('Invalid capture name');
  writeFileSync(resolve(dir, result.name + '.webm'), Buffer.from(result.bytes));
  const { bytes, ...metadata } = result;
  writeFileSync(resolve(dir, result.name + '.json'), JSON.stringify({ source: 'Actual IWSDK emulator; synthetic hands, demo execution, uncut capture', ...metadata }, null, 2));
  return { file: resolve(dir, result.name + '.webm'), bytes: bytes.length, ...metadata };
}
