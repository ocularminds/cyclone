import type { CueName } from '../app';

type Voice = { osc: OscillatorNode; gain: GainNode; panner: PannerNode; filter: BiquadFilterNode; base: number };

/** A machine's voice: waveform, base pitch and filter (each machine sounds different, C24). */
export type VoiceSpec = { type: OscillatorType; freq: number; cutoff: number };

/**
 * Procedural sound (C24): all audio is synthesised — no recorded or licensed
 * files. Machine hums are positional and their pitch rises with risk; cues
 * are short envelopes placed where the event happens.
 */
export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly voices = new Map<string, Voice>();
  private readonly pending: Array<() => void> = [];

  /** Must be called from a user gesture or XR session start (autoplay policy). */
  resume(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(this.ctx.destination);
        this.pending.splice(0).forEach((f) => f());
      }
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private panner(x: number, y: number, z: number): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 0.3;
    p.rolloffFactor = 1.2;
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    p.connect(this.master!);
    return p;
  }

  listener(px: number, py: number, pz: number, fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
    const l = this.ctx?.listener;
    if (!l || !l.positionX) return;
    const t = this.ctx!.currentTime;
    l.positionX.setTargetAtTime(px, t, 0.02);
    l.positionY.setTargetAtTime(py, t, 0.02);
    l.positionZ.setTargetAtTime(pz, t, 0.02);
    l.forwardX.setTargetAtTime(fx, t, 0.02);
    l.forwardY.setTargetAtTime(fy, t, 0.02);
    l.forwardZ.setTargetAtTime(fz, t, 0.02);
    l.upX.setTargetAtTime(ux, t, 0.02);
    l.upY.setTargetAtTime(uy, t, 0.02);
    l.upZ.setTargetAtTime(uz, t, 0.02);
  }

  /** Create or move a machine hum. */
  voice(id: string, spec: VoiceSpec, x: number, y: number, z: number): void {
    if (!this.ctx) {
      this.pending.push(() => this.voice(id, spec, x, y, z));
      return;
    }
    let v = this.voices.get(id);
    if (!v) {
      const osc = this.ctx.createOscillator();
      osc.type = spec.type;
      osc.frequency.value = spec.freq;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = spec.cutoff;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.015;
      const panner = this.panner(x, y, z);
      osc.connect(filter).connect(gain).connect(panner);
      osc.start();
      v = { osc, gain, panner, filter, base: spec.freq };
      this.voices.set(id, v);
    }
    const t = this.ctx.currentTime;
    v.panner.positionX.setTargetAtTime(x, t, 0.05);
    v.panner.positionY.setTargetAtTime(y, t, 0.05);
    v.panner.positionZ.setTargetAtTime(z, t, 0.05);
  }

  /** Risk raises the tone from the machine's location: level 0..3, plus activity 0..1. */
  tension(id: string, level: number, activity: number, quiet: boolean): void {
    const v = this.voices.get(id);
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    const semis = [0, 3, 7, 12][Math.max(0, Math.min(3, level))];
    v.osc.frequency.setTargetAtTime(v.base * Math.pow(2, semis / 12), t, 0.3);
    const g = quiet ? 0.004 : 0.012 + activity * 0.02 + level * 0.008;
    v.gain.gain.setTargetAtTime(g, t, 0.25);
    v.filter.frequency.setTargetAtTime(400 + level * 500, t, 0.3);
  }

  /** Short synthesised cue at a world position. */
  cue(name: CueName, x: number, y: number, z: number, level = 0): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = this.panner(x, y, z);
    const tone = (f0: number, f1: number, dur: number, type: OscillatorType, vol: number, at = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + dur);
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(vol, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g).connect(out);
      o.start(t + at);
      o.stop(t + at + dur + 0.05);
    };
    const lift = Math.pow(2, ([0, 3, 7, 12][level] ?? 0) / 12);
    switch (name) {
      case 'drop':
        tone(880 * lift, 440 * lift, 0.18, 'sine', 0.25);
        tone(220, 180, 0.12, 'triangle', 0.15, 0.16);
        break;
      case 'unfold':
        tone(523, 523, 0.25, 'sine', 0.12);
        tone(659, 659, 0.25, 'sine', 0.1, 0.05);
        break;
      case 'scrub':
        tone(1600, 1500, 0.025, 'square', 0.03);
        break;
      case 'lock':
        tone(140, 90, 0.12, 'square', 0.2);
        tone(140, 90, 0.12, 'square', 0.2, 0.15);
        break;
      case 'hold':
        tone(220, 660, 1.5, 'sawtooth', 0.06);
        break;
      case 'seal':
        tone(1046, 1046, 0.5, 'sine', 0.18);
        tone(1568, 1568, 0.6, 'sine', 0.1, 0.06);
        break;
      case 'veto':
        tone(400, 60, 0.45, 'sawtooth', 0.12);
        break;
      case 'drill':
        tone(660, 660, 0.18, 'triangle', 0.2);
        tone(494, 494, 0.3, 'triangle', 0.2, 0.2);
        break;
      case 'escalate':
        tone(330, 990, 0.35, 'triangle', 0.15);
        break;
      case 'deny':
        tone(180, 170, 0.35, 'square', 0.12);
        break;
      case 'rule':
        [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.18, 'sine', 0.12, i * 0.08));
        break;
      case 'expire':
        tone(300, 80, 0.9, 'sine', 0.15);
        break;
      case 'risk':
        tone(300 * lift, 600 * lift, 0.25, 'triangle', 0.14);
        break;
    }
  }

  quiet(): void {
    for (const id of this.voices.keys()) this.tension(id, 0, 0, true);
  }
}
