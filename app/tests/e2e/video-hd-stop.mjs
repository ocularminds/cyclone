import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
// Stops the HD capture and streams the recording out in slices (it is too large for one evaluate).
export default async function run({ frame, workspaceRoot }) {
  const meta = await frame.evaluate(async () => {
    const r = window.cycloneRecording; if (!r) throw Error('No recording in this page');
    await new Promise(done => { r.recorder.onstop = done; r.recorder.stop(); });
    r.stop(); r.off(); r.synth.master.disconnect(r.audio);
    for (const track of r.stream.getTracks()) track.stop();
    for (const v of r.layers) { v.srcObject?.getTracks().forEach(t => t.stop()); v.remove(); }
    window.cycloneBlob = new Blob(r.chunks, { type: r.recorder.mimeType });
    return { name: r.name, events: r.events, duration: (performance.now() - r.start) / 1000, size: r.canvas, sources: r.sources,
      type: r.recorder.mimeType, bytes: window.cycloneBlob.size,
      records: window.cyclone.app.ledger.own().map(x => ({ id: x.record_id, tool: x.tool, decision: x.decision.decision })) };
  });
  if (!/^[a-z0-9_-]{1,32}$/.test(meta.name)) throw Error('Invalid capture name');
  const dir = resolve(workspaceRoot, '../docs/revision3/video'); mkdirSync(dir, { recursive: true });
  const file = resolve(dir, meta.name + '.webm'); writeFileSync(file, Buffer.alloc(0));
  const SLICE = 4 * 1024 * 1024;
  for (let at = 0; at < meta.bytes; at += SLICE) {
    const b64 = await frame.evaluate(async ([from, to]) => {
      const buf = new Uint8Array(await window.cycloneBlob.slice(from, to).arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, [at, Math.min(meta.bytes, at + SLICE)]);
    appendFileSync(file, Buffer.from(b64, 'base64'));
  }
  await frame.evaluate(() => { delete window.cycloneBlob; });
  writeFileSync(resolve(dir, meta.name + '.json'), JSON.stringify({ source: 'Emulator room layer + actual IWSDK canvas (Chrome for Testing, headed, GPU); synthetic hands, demo execution, uncut capture', ...meta }, null, 2));
  return { file, ...meta, events: meta.events.length };
}
