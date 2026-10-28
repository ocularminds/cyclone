import {
  createSystem,
  Grabbed,
  PokeInteractable,
  Pressed,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import type { Cyclone } from '../app';
import { CardTag, TokenTag } from '../components';
import type { Token } from '../flow/shift';
import { GesturePolicy } from '../flow/policy';
import { Palette } from '../models/palette';
import type { Stage } from '../stage';
import { Label, type Line } from '../ui/label';

/**
 * Inspect (C02, C21): looking at a token lifts it and unfolds a card in the
 * central view, just above the token — agent and sigil, one-line rationale, the rule that tripped,
 * blast radius, rehearsal verdict. Pinch (or poke) the card for the full
 * rationale. Card centre 9° above the token's line of sight; extents ±16° H / ±8° V.
 */
export class CardSystem extends createSystem({
  pressed: { required: [CardTag, Pressed] },
  grabbedTokens: { required: [TokenTag, Grabbed] },
}) {
  static readonly WIDTH = 0.24;
  static readonly HEIGHT = 0.12;
  static readonly DISTANCE = 0.42;
  static readonly LIFT_DEG = 9;
  private app!: Cyclone;
  private stage!: Stage;
  private label!: Label;
  private candidate: string | null = null;
  private dwell = 0;
  private open = 0;
  private readonly tmp = new Vector3();
  private readonly at = new Vector3();
  private readonly target = new Vector3();
  private readonly q = new Quaternion();
  private readonly fwd = new Vector3();

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    this.label = new Label(CardSystem.WIDTH, CardSystem.HEIGHT);
    this.label.mesh.name = 'decision-card';
    const entity = this.world.createTransformEntity(this.label.mesh, { parent: this.stage.rootEntity! });
    entity.addComponent(CardTag);
    entity.addComponent(PokeInteractable);
    this.stage.rayTargets.push(entity);
    this.label.mesh.visible = false;
    this.label.mesh.scale.setScalar(0.001);
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', () => {
        if (!this.stage.focus) return;
        this.stage.detail = !this.stage.detail;
        this.app.cue('unfold', this.stage.detail ? 'Full rationale' : 'Summary');
      }),
      this.queries.grabbedTokens.subscribe('qualify', (e) => this.focus(e.getValue(TokenTag, 'intentId') as string)),
      this.app.shift.events.on('amended', () => (this.dwell = 0)),
    );
  }

  private focus(id: string): void {
    if (this.stage.focus === id) return;
    this.stage.focus = id;
    this.stage.detail = false;
    this.stage.scrub = 0;
    this.app.shift.inspect(id);
    const v = this.stage.views.get(id);
    this.app.cue('unfold', `Inspecting: ${v?.token.intent.agent.label ?? 'intent'}`, v ? [v.home.x, v.home.y, v.home.z] : undefined);
    this.placeCard(true);
  }

  /** Gaze dwell selects the token being looked at (head-gaze cone; eye gaze when the runtime provides it). */
  private gazePick(delta: number): void {
    let best: string | null = null;
    let bestAngle = this.app.settings.get('eyesOnly') ? 7 : 9;
    for (const [id, v] of this.stage.views) {
      if (v.place !== 'tray' && v.place !== 'slot' && v.place !== 'rack') continue;
      v.object.getWorldPosition(this.at);
      this.stage.toDesk(this.at);
      const a = this.stage.gazeAngle(this.at, this.tmp);
      if (a < bestAngle) {
        bestAngle = a;
        best = id;
      }
    }
    if (best && best !== this.stage.focus) {
      this.dwell = best === this.candidate ? this.dwell + delta : 0;
      this.candidate = best;
      if (this.dwell >= (this.app.settings.get('eyesOnly') ? 0.6 : 0.25)) this.focus(best);
    } else {
      this.dwell = 0;
      this.candidate = best;
    }
  }

  /**
   * Card target: 9° above the line of sight to the focused token, 0.42 m out,
   * so it sits in the central view without occluding the token or the reach
   * path to it (C21).
   */
  private placeCard(snap: boolean): void {
    const head = this.stage.head;
    const view = this.stage.focus ? this.stage.views.get(this.stage.focus) : undefined;
    if (view) {
      view.object.getWorldPosition(this.fwd);
      this.stage.toDesk(this.fwd).sub(head).normalize();
    } else this.fwd.copy(this.stage.gaze);
    const pitch = Math.asin(Math.max(-1, Math.min(1, this.fwd.y))) + (CardSystem.LIFT_DEG * Math.PI) / 180;
    const yaw = Math.atan2(this.fwd.x, this.fwd.z);
    this.fwd.set(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    this.target.copy(head).addScaledVector(this.fwd, CardSystem.DISTANCE);
    if (snap) this.label.mesh.position.copy(this.target);
  }

  update(delta: number): void {
    this.gazePick(delta);
    const id = this.stage.focus;
    const view = id ? this.stage.views.get(id) : undefined;
    if (id && (!view || view.place === 'leaving' || view.place === 'gone')) this.stage.focus = null;
    const visible = !!this.stage.focus && !!view;
    this.open += ((visible ? 1 : 0) - this.open) * Math.min(1, delta * 10);
    const mesh = this.label.mesh;
    mesh.visible = this.open > 0.02;
    if (!mesh.visible || !view) return;
    this.placeCard(false);
    mesh.position.lerp(this.target, Math.min(1, delta * 4));
    mesh.lookAt(this.at.copy(this.stage.head).applyMatrix4(this.stage.root.matrixWorld));
    mesh.scale.set(this.open, Math.max(0.001, this.open * this.open), 1);
    this.label.draw(this.lines(view.token), {
      background: '#f6efe2',
      border: Palette.risk(view.token.intent.risk.level),
      padding: 0.01,
      radius: 0.012,
    });
  }

  private lines(token: Token): Line[] {
    const i = token.intent;
    const app = this.app;
    const r = token.rehearsal;
    const assets = r.affected.map((a) => app.rehearsal.asset(a)?.label ?? app.rehearsal.zone(a)?.label ?? a);
    const ctx = { eyesOnly: app.settings.get('eyesOnly'), oneHanded: app.settings.get('oneHanded'), tampered: token.tampered };
    const secs = Math.max(0, Math.round((token.deadlineMs - app.clock.ms) / 1000));
    const ttl = secs >= 120 ? `${Math.round(secs / 60)} min` : `${secs}s`;
    const risk = `${Palette.RISK_NAMES[i.risk.level]} risk`;
    const spec = i.amend;
    const value = spec && token.value !== null ? `${token.value}${spec.unit}${token.amended ? ` (was ${i.args[spec.param]}${spec.unit})` : ''}` : '';
    const verdict = r.breach
      ? `Rehearsal: breaches ${r.breach.zone_label} at ${Math.round(r.breach.t * 100)}%`
      : 'Rehearsal: stays inside every envelope';
    const out: Line[] = [
      { text: `${i.agent.label}  ·  ${risk}  ·  ${ttl} left`, size: 0.0085, weight: 600, color: '#5d6b78' },
      { text: i.summary ?? i.tool, size: 0.0115, weight: 700 },
    ];
    if (this.stage.detail) {
      out.push({ text: i.rationale ?? '(no rationale given)', size: 0.0085 });
      out.push({ text: `Why held: ${i.risk.reasons.join('; ')}`, size: 0.0078, color: '#5d6b78' });
      out.push({ text: `Binding ${token.glyph.label} · ${token.hash.slice(0, 23)}…`, size: 0.0072, color: '#5d6b78' });
    } else {
      out.push({ text: `Rule: ${i.policy.rule_id}${value ? `  ·  ${value}` : ''}`, size: 0.0085 });
      out.push({ text: `Blast radius: ${assets.join(', ')}`, size: 0.0085 });
      out.push({ text: verdict, size: 0.0085, weight: 600, color: r.breach ? '#a8287f' : '#2f6fb8' });
    }
    if (token.tampered) out.push({ text: 'Payload changed after it was held — veto or escalate.', size: 0.0085, weight: 700, color: '#a8287f' });
    if (token.denial) out.push({ text: `Policy gate: ${token.denial}`, size: 0.0085, weight: 700, color: '#a8287f' });
    out.push({ text: `${GesturePolicy.approvalHint(i, ctx)} · pinch card for ${this.stage.detail ? 'summary' : 'full rationale'}`, size: 0.0075, color: '#5d6b78' });
    return out;
  }
}
