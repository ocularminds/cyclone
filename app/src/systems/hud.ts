import { createSystem, Vector3 } from '@iwsdk/core';
import type { Cyclone } from '../app';
import { Palette } from '../models/palette';
import type { Stage } from '../stage';
import { Label, type Line } from '../ui/label';
import { ReadingLayer } from '../ui/reading-layer';

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
    this.captions = new Label(0.30, 0.018);
    this.toast = new Label(0.28, 0.045);
    this.summary = new Label(0.28, 0.245);
    this.captions.mesh.name = 'cue-caption'; this.toast.mesh.name = 'feedback'; this.summary.mesh.name = 'shift-summary';
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
    this.stage.caption = captionsOn && this.lines.length ? this.lines[0].text : '';
    const cap = this.captions.mesh;
    cap.visible = !!this.stage.caption && !this.stage.settingsOpen && !this.stage.focus && !this.stage.replayOpen;
    if (cap.visible) {
      this.spot(cap.position, 14, 0.55);
      this.face(cap);
      this.captions.caption(this.stage.caption);
    }
    const t = this.toastText;
    if (t) t.age += delta;
    this.toast.mesh.visible = !!t && t.age < 4.5 && !this.stage.settingsOpen && !this.stage.focus && !this.stage.replayOpen;
    if (t && this.toast.mesh.visible) {
      this.spot(this.toast.mesh.position, -9, 0.55);
      this.face(this.toast.mesh);
      const colour = t.tone === 'warn' ? Palette.ui.danger : t.tone === 'good' ? Palette.ui.accent : Palette.ui.text;
      this.toast.draw([{ text: t.text, size: 0.009, weight: 700, color: colour }], {
        background: Palette.ui.surface,
        border: colour,
        padding: 0.006,
        radius: 0.008,
        align: 'center',
      });
    }
    this.summary.mesh.visible = this.showSummary && !this.stage.settingsOpen && !this.stage.replayOpen;
    if (this.summary.mesh.visible) {
      this.spot(this.summary.mesh.position, 0, 0.565);
      this.face(this.summary.mesh);
      this.summary.draw(this.summaryLines(), { background: Palette.ui.surface, border: Palette.ui.border, padding: 0.01, radius: 0.012 });
    }
    if (this.captions.mesh.visible) ReadingLayer.apply(this.captions.mesh);
    if (this.toast.mesh.visible) ReadingLayer.apply(this.toast.mesh);
    if (this.summary.mesh.visible) ReadingLayer.apply(this.summary.mesh);
  }

  private summaryLines(): Line[] {
    const s = this.app.log.summary();
    const rings = this.app.cast.agents.map((a) => `${a.label.replace(/ Agent$/, '')} ${Math.round(this.app.trust.ring(a.id) * 100)}%`).join(' / ');
    return [
      { text: 'Shift summary', size: 0.015, weight: 700, display: true },
      { text: `${s.decisions} decisions · ${s.amended} amended · ${s.vetoed} vetoed`, size: 0.01 },
      { text: `${s.escalated} escalated · ${s.drillsMissed} drills missed · ${s.drillsCaught} caught`, size: 0.009 },
      { text: `${s.drillsUnassessed} drills unassessed`, size: 0.009 },
      { text: `${s.falseAlarms} false alarms · ${s.auto} rule approvals · ${s.expired} expired`, size: 0.009 },
      { text: `Calibration: ${this.app.calibration.label}`, size: 0.01, weight: 600, color: Palette.ui.accent },
      { text: `Trust rings: ${rings}`, size: 0.009, color: Palette.ui.muted },
      { text: 'Rings show progression, not safety evidence.', size: 0.009, color: Palette.ui.muted },
      { text: this.app.gate.capabilities.source === 'demo' ? 'Demo execution is simulated. Rehearsals are models.' : 'Physical execution is not confirmed. Rehearsals are models.', size: 0.009, color: Palette.ui.muted },
    ];
  }
}
