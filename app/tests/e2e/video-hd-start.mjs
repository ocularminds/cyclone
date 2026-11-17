// HD capture of what the emulator window shows: the emulator's room layer plus the
// application's actual WebGL output, composited in z-order at 1920×1080, with the app's
// WebAudio mix. The emulator's own control overlay and transform gizmos are hidden
// (they are tooling, not the app). No generated or substitute footage.
export default async function run({ frame }) {
  return frame.evaluate(async () => {
    const c = window.cyclone;
    const { Synth } = await import('/src/audio/synth.ts');
    const listener = Synth.prototype.listener;
    let synth;
    Synth.prototype.listener = function (...args) { synth = this; return listener.apply(this, args); };
    for (let i = 0; i < 120 && !synth; i++) await new Promise(requestAnimationFrame);
    Synth.prototype.listener = listener;
    if (!synth?.ctx || !synth.master) throw Error('The actual audio mix is unavailable');

    const app = c.world.renderer.domElement;
    const z = el => Number(getComputedStyle(el).zIndex) || 0;
    const canvases = [...document.querySelectorAll('canvas')];
    const room = canvases.filter(k => k !== app && z(k) < z(app)).sort((a, b) => z(a) - z(b));
    for (const k of canvases) if (k !== app && z(k) > z(app)) k.style.visibility = 'hidden'; // emulator gizmos
    for (const e of document.querySelectorAll('*')) if (e.shadowRoot) e.style.visibility = 'hidden'; // emulator controls
    const layers = [...room, app].map(k => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.srcObject = k.captureStream(30);
      Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none', zIndex: '-1' });
      document.body.appendChild(v); v.play();
      return v;
    });
    const out = document.createElement('canvas'); out.width = 1920; out.height = 1080;
    const ctx = out.getContext('2d');
    let running = true;
    const draw = () => {
      if (!running) return;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
      for (const v of layers) if (v.videoWidth) ctx.drawImage(v, 0, 0, 1920, 1080);
      requestAnimationFrame(draw);
    };
    draw();
    const audio = synth.ctx.createMediaStreamDestination(); synth.master.connect(audio);
    const stream = out.captureStream(30);
    for (const track of audio.stream.getAudioTracks()) stream.addTrack(track);
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(MediaRecorder.isTypeSupported);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 10000000 });
    const recording = { name: window.cycloneCaptureName ?? 'workflow', recorder, chunks: [], events: [], start: performance.now(),
      canvas: [1920, 1080], sources: [...room, app].map(k => [k.width, k.height]), synth, audio, stream, layers, stop: () => { running = false; } };
    recording.off = c.app.bus.on('cue', event => recording.events.push({ seconds: (performance.now() - recording.start) / 1000, ...event }));
    recorder.ondataavailable = event => { if (event.data.size) recording.chunks.push(event.data); };
    recorder.start(1000); window.cycloneRecording = recording;
    return { source: 'Emulator room layer + actual IWSDK canvas, app audio mix', size: recording.canvas, sources: recording.sources, mimeType: type };
  });
}
