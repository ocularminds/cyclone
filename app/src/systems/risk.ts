import { Color, createSystem, Grabbed, type MeshBasicMaterial, type MeshLambertMaterial } from '@iwsdk/core';
import type { Cyclone } from '../app';
import { Palette } from '../models/palette';
import type { Stage, TokenView } from '../stage';

/**
 * RiskEncodingSystem (C23, C27): risk is never colour alone. Shape is baked
 * into the token (smooth → spiked) and hatching on its sides; this system adds
 * motion — a slow breathing pulse at level 0 rising to an irregular stutter at
 * level 3 — the onboarding glow halo, and applies high-contrast mode.
 */
export class RiskEncodingSystem extends createSystem({}) {
  private app!: Cyclone;
  private stage!: Stage;
  private time = 0;
  private readonly c = new Color();

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    Palette.setHighContrast(this.app.settings.get('highContrast'));
    this.cleanupFuncs.push(
      this.app.settings.changes.on('change', ({ key, value }) => {
        if (key !== 'highContrast') return;
        Palette.setHighContrast(value as boolean);
        for (const v of this.stage.views.values()) this.recolour(v);
      }),
      this.app.bus.on('hint', ({ intentId, hint }) => {
        const v = this.stage.views.get(intentId);
        if (v && (hint === 'glow' || hint === 'pinch')) {
          v.hint = hint;
          v.hintTime = 0;
        }
      }),
    );
  }

  private recolour(v: TokenView): void {
    const mats = v.parts.body.material as MeshLambertMaterial[];
    mats[0].color.set(Palette.risk(v.token.intent.risk.level));
  }

  /** Pulse profile per level: [rate Hz, depth, stutter]. */
  static readonly MOTION = [
    [0.6, 0.02, 0],
    [1.1, 0.035, 0],
    [1.8, 0.05, 0.4],
    [3.2, 0.07, 1],
  ] as const;

  update(delta: number): void {
    this.time += delta;
    const t = this.time;
    for (const [id, v] of this.stage.views) {
      if (v.place === 'leaving' || v.place === 'gone') continue;
      const level = v.token.intent.risk.level;
      const [rate, depth, stutter] = RiskEncodingSystem.MOTION[level];
      const phase = t * rate * Math.PI * 2;
      // stutter: a deterministic broken rhythm, not random noise
      const hitch = stutter * (Math.sin(phase * 2.7) > 0.6 ? Math.sin(phase * 9) * 0.5 : 0);
      const s = 1 + Math.sin(phase) * depth + hitch * depth;
      const body = v.parts.body;
      body.scale.set(s, 1 + (s - 1) * 0.5, s);
      body.rotation.y = stutter ? hitch * 0.12 * stutter : t * 0.15;
      if (v.entity.hasComponent(Grabbed)) body.scale.setScalar(1.08);
      // halo: onboarding "glow until looked at" (C14) and focus ring
      const halo = v.parts.halo.material as MeshBasicMaterial;
      let target = this.stage.focus === id ? 0.55 : 0;
      if (v.hint === 'glow') {
        if (v.token.inspected) v.hint = null;
        else target = 0.5 + Math.sin(t * 5) * 0.4;
      } else if (v.hint === 'pinch') {
        v.hintTime += delta;
        target = v.hintTime < 1.2 ? Math.abs(Math.sin(v.hintTime * Math.PI * 1.6)) : 0;
        v.parts.halo.scale.setScalar(1 + Math.min(1, v.hintTime) * 0.6);
        if (v.hintTime > 1.2) {
          v.hint = null;
          v.parts.halo.scale.setScalar(1);
        }
      }
      halo.opacity += (target - halo.opacity) * Math.min(1, delta * 10);
      halo.color.copy(this.c.set(Palette.risk(level)));
      // denied amendments flash the body magenta-hatched until amended again
      v.parts.glyph.visible = true;
    }
  }
}
