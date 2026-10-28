import { createSystem, Vector3 } from '@iwsdk/core';
import type { Cyclone } from '../app';
import { Layout } from '../models/layout';
import type { Stage } from '../stage';
import { Label, type Line } from '../ui/label';

type Caption = { text: string; age: number };

/**
 * HudSystem (C18, C28, C47): captions for every audio cue (on by default),
 * brief toasts (drill reveals, refusals), and the end-of-shift summary with
 * trust rings and calibration. Hidden entirely in the end-card capture.
 */
export class HudSystem extends createSystem({}) {
  private app!: Cyclone;
  private stage!: Stage;
  private captions!: Label;
  private toast!: Label;
  private summary!: Label;
  private readonly lines: Caption[] = [];
  private toastText: { text: string; tone: string; age: number } | null = null;
  private showSummary = false;
  private hidden = false;
  private readonly v = new Vector3();
  private readonly fwd = new Vector3();

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    this.hidden = this.app.boot.capture === 'endcard';
    this.captions = new Label(0.26, 0.05);
    this.toast = new Label(0.22, 0.03);
    this.summary = new Label(0.26, 0.16);
    for (const l of [this.captions, this.toast, this.summary]) {
      l.mesh.visible = false;
      this.stage.root.add(l.mesh);
    }
    this.cleanupFuncs.push(
      this.app.bus.on('cue', ({ caption }) => {
        if (!caption) return;
        if (this.lines[0]?.text === caption) {
          this.lines[0].age = 0;
          return;
        }
        this.lines.unshift({ text: caption, age: 0 });
        this.lines.length = Math.min(this.lines.length, 3);
      }),
      this.app.bus.on('toast', ({ text, tone }) => (this.toastText = { text, tone, age: 0 })),
      this.app.bus.on('summary', ({ show }) => (this.showSummary = show)),
    );
  }

  /** A spot `down` degrees below the current gaze, `dist` metres out (desk frame). */
  private spot(out: Vector3, down: number, dist: number): Vector3 {
    this.fwd.copy(this.stage.gaze);
    const pitch = Math.asin(Math.max(-1, Math.min(1, this.fwd.y))) - (down * Math.PI) / 180;
    const yaw = Math.atan2(this.fwd.x, this.fwd.z);
    this.fwd.set(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    return out.copy(this.stage.head).addScaledVector(this.fwd, dist);
  }

  private face(mesh: { lookAt: (v: Vector3) => void }): void {
    mesh.lookAt(this.v.copy(this.stage.head).applyMatrix4(this.stage.root.matrixWorld));
  }

  update(delta: number): void {
    if (this.hidden) return;
    const captionsOn = this.app.settings.get('captions');
    for (const c of this.lines) c.age += delta;
    while (this.lines.length && this.lines[this.lines.length - 1].age > 4) this.lines.pop();
    const cap = this.captions.mesh;
    cap.visible = captionsOn && this.lines.length > 0;
    if (cap.visible) {
      this.spot(cap.position, 16, 0.5);
      this.face(cap);
      this.captions.draw(
        this.lines.map((c, i): Line => ({ text: c.text, size: i === 0 ? 0.0095 : 0.0078, weight: i === 0 ? 600 : 400, color: i === 0 ? '#ffffff' : '#d9d2c4' })),
        { background: 'rgba(28,24,20,0.78)', padding: 0.006, radius: 0.006, align: 'center' },
      );
    }
    const t = this.toastText;
    if (t) t.age += delta;
    this.toast.mesh.visible = !!t && t.age < 4.5;
    if (t && this.toast.mesh.visible) {
      this.spot(this.toast.mesh.position, -14, 0.55);
      this.face(this.toast.mesh);
      const colour = t.tone === 'warn' ? '#a8287f' : t.tone === 'good' ? '#2f6fb8' : '#2b2622';
      this.toast.draw([{ text: t.text, size: 0.0105, weight: 700, color: colour }], {
        background: '#f6efe2',
        border: colour,
        padding: 0.006,
        radius: 0.008,
        align: 'center',
      });
    }
    this.summary.mesh.visible = this.showSummary;
    if (this.showSummary) {
      this.summary.mesh.position.set(Layout.HUD[0], Layout.HUD[1], Layout.HUD[2]);
      this.face(this.summary.mesh);
      this.summary.draw(this.summaryLines(), { background: '#f6efe2', border: '#6e4f37', padding: 0.012, radius: 0.012 });
    }
  }

  private summaryLines(): Line[] {
    const s = this.app.log.summary();
    const rings = this.app.cast.agents
      .map((a) => `${a.label} ${Math.round(this.app.trust.ring(a.id) * 100)}%`)
      .join('  ·  ');
    return [
      { text: 'Shift summary', size: 0.014, weight: 700 },
      { text: `${s.decisions} decisions · ${s.amended} amended · ${s.vetoed} vetoed · ${s.escalated} escalated`, size: 0.01 },
      { text: `${s.drillsMissed} drill${s.drillsMissed === 1 ? '' : 's'} missed · ${s.drillsCaught} caught · ${s.auto} auto-executed by rules · ${s.expired} expired`, size: 0.0095 },
      { text: `Calibration: ${this.app.calibration.label}`, size: 0.0095, weight: 600, color: '#2f6fb8' },
      { text: `Trust rings: ${rings}`, size: 0.0085, color: '#5d6b78' },
      { text: 'Execution in this demo is simulated. Rehearsals come from the twin’s kinematic model, not predictions.', size: 0.0072, color: '#5d6b78' },
    ];
  }
}
