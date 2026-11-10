// Capture the application's actual WebGL output and its WebAudio mix. No generated footage.
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
    const audio = synth.ctx.createMediaStreamDestination(); synth.master.connect(audio);
    const canvas = c.world.renderer.domElement;
    const stream = canvas.captureStream(30);
    for (const track of audio.stream.getAudioTracks()) stream.addTrack(track);
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(MediaRecorder.isTypeSupported);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5000000 });
    const recording = { name: window.cycloneCaptureName ?? 'workflow', recorder, chunks: [], events: [], start: performance.now(), canvas: [canvas.width, canvas.height], synth, audio, stream };
    recording.off = c.app.bus.on('cue', event => recording.events.push({ seconds: (performance.now() - recording.start) / 1000, ...event }));
    recorder.ondataavailable = event => { if (event.data.size) recording.chunks.push(event.data); };
    recorder.start(1000); window.cycloneRecording = recording;
    return { source: 'Actual IWSDK IWER canvas and app audio mix', size: recording.canvas, tracks: stream.getTracks().map(t => t.kind), mimeType: type };
  });
}
