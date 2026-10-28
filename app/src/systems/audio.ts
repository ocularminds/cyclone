import { createSystem, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import type { Cyclone } from '../app';
import { Synth, type VoiceSpec } from '../audio/synth';
import { Layout } from '../models/layout';
import type { Stage } from '../stage';

/**
 * SpatialAudioSystem (C24): every machine hums from its position with its own
 * voice; pending risk raises that machine's tone; cues fire once per event at
 * the place it happens. Captions for each cue are drawn by HudSystem (C28).
 */
export class SpatialAudioSystem extends createSystem({}) {
  static readonly VOICES: Record<string, VoiceSpec> = {
    conveyor: { type: 'sawtooth', freq: 55, cutoff: 380 },
    arm: { type: 'triangle', freq: 82.4, cutoff: 700 },
    oven: { type: 'sine', freq: 41.2, cutoff: 300 },
    lift: { type: 'square', freq: 65.4, cutoff: 260 },
  };
  private app!: Cyclone;
  private stage!: Stage;
  readonly synth = new Synth();
  private readonly p = new Vector3();
  private readonly f = new Vector3();
  private readonly u = new Vector3();
  private readonly q = new Quaternion();
  private readonly levels = new Map<string, number>();
  private quiet = false;

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    this.quiet = this.app.boot.capture === 'endcard';
    const wake = () => this.synth.resume();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    this.cleanupFuncs.push(
      () => window.removeEventListener('pointerdown', wake),
      () => window.removeEventListener('keydown', wake),
      this.visibilityState.subscribe((s) => {
        if (s === VisibilityState.Visible) wake();
      }),
      this.app.bus.on('cue', ({ name, at, level }) => {
        const pos = at ?? Layout.HUD;
        this.p.set(pos[0], pos[1], pos[2]).applyMatrix4(this.stage.root.matrixWorld);
        this.synth.cue(name, this.p.x, this.p.y, this.p.z, level ?? 0);
      }),
    );
  }

  update(): void {
    if (!this.synth.ready) return;
    this.camera.getWorldPosition(this.p);
    this.camera.getWorldDirection(this.f);
    this.u.set(0, 1, 0).applyQuaternion(this.camera.getWorldQuaternion(this.q));
    this.synth.listener(this.p.x, this.p.y, this.p.z, this.f.x, this.f.y, this.f.z, this.u.x, this.u.y, this.u.z);
    this.levels.clear();
    for (const v of this.stage.views.values()) {
      if (v.token.status !== 'held') continue;
      const a = v.token.intent.target.asset_id;
      this.levels.set(a, Math.max(this.levels.get(a) ?? -1, v.token.intent.risk.level));
    }
    for (const [id, rig] of this.stage.rigs) {
      const spec = SpatialAudioSystem.VOICES[rig.kind];
      if (!spec) continue;
      rig.root.getWorldPosition(this.p);
      this.synth.voice(id, spec, this.p.x, this.p.y, this.p.z);
      const level = this.levels.get(id);
      this.synth.tension(id, Math.max(0, level ?? 0), level === undefined ? 0 : 1, this.quiet);
    }
  }
}
