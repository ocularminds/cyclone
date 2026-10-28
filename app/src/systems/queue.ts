import {
  BufferAttribute,
  BufferGeometry,
  Color,
  createSystem,
  Grabbed,
  Line,
  LineBasicMaterial,
  OneHandGrabbable,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Cyclone } from '../app';
import { TokenTag } from '../components';
import type { Token } from '../flow/shift';
import { Layout } from '../models/layout';
import { Palette } from '../models/palette';
import { Tokens } from '../models/token';
import { TokenView, type Stage } from '../stage';

/**
 * IntentQueueSystem (C01, C29, C37): turns held intents into tokens that drop
 * into the holding tray, tethers each to its machine with a light thread,
 * sinks them as their TTL runs out, parks escalations in the rack, and runs
 * the session clock — frozen whenever the session is hidden.
 */
export class IntentQueueSystem extends createSystem({
  tokens: { required: [TokenTag] },
  grabbed: { required: [TokenTag, Grabbed] },
}) {
  private app!: Cyclone;
  private stage!: Stage;
  private running = false;
  private hidden = false;
  private readonly flat = new URLSearchParams(location.search).has('flat');
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private rackCount = 0;

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    const shift = this.app.shift;
    const onHidden = () => {
      this.hidden = document.hidden;
      this.syncClock();
    };
    document.addEventListener('visibilitychange', onHidden);
    this.cleanupFuncs.push(
      () => document.removeEventListener('visibilitychange', onHidden),
      this.visibilityState.subscribe((s) => {
        this.running = s === VisibilityState.Visible || (this.flat && s === VisibilityState.NonImmersive);
        this.syncClock();
      }),
      shift.events.on('arrived', (t) => this.spawn(t)),
      shift.events.on('superseded', ({ token }) => this.leave(token.id, 'gone')),
      shift.events.on('escalated', ({ token }) => {
        const v = this.stage.views.get(token.id);
        if (!v) return;
        v.moveTo(Layout.rackSpot(this.rackCount++), 'rack');
      }),
      shift.events.on('sealed', ({ token }) => this.leave(token.id, 'leaving')),
      shift.events.on('expired', (t) => {
        const v = this.stage.views.get(t.id);
        if (v) this.app.cue('expire', 'Expired: auto-rejected, nothing executed', IntentQueueSystem.arr(v.home));
      }),
      this.queries.grabbed.subscribe('qualify', (e) => {
        const v = this.stage.views.get(e.getValue(TokenTag, 'intentId') as string);
        if (v) v.place = 'grabbed';
      }),
    );
  }

  private syncClock(): void {
    const on = this.running && !this.hidden;
    if (on) this.app.clock.resume();
    else this.app.clock.pause();
  }

  static arr(v: Vector3): [number, number, number] {
    return [v.x, v.y, v.z];
  }

  private spawn(token: Token): void {
    if (this.stage.views.has(token.id)) return;
    const agent = this.app.cast.agents.find((a) => a.id === token.intent.agent.id);
    const parts = Tokens.token(token.intent.risk.level, token.glyph, agent?.sigil ?? 'ring');
    const entity = this.world.createTransformEntity(parts.root, { parent: this.stage.rootEntity! });
    entity.addComponent(TokenTag, { intentId: token.id });
    entity.addComponent(OneHandGrabbable, { rotate: true, translate: true });
    const view = new TokenView(token, entity, parts);
    this.stage.views.set(token.id, view);
    const spot = Layout.traySpot(this.trayIndex());
    parts.root.position.set(spot[0], spot[1] + 0.25, spot[2]);
    view.moveTo(spot, 'tray');
    view.thread = this.thread(token);
    this.stage.root.add(view.thread);
    this.app.cue(
      'drop',
      `Held: ${token.intent.agent.label} wants to ${token.intent.summary ?? token.intent.tool}`,
      spot as [number, number, number],
      token.intent.risk.level,
    );
  }

  private trayIndex(): number {
    let n = 0;
    for (const v of this.stage.views.values()) if (v.place === 'tray' || v.place === 'arriving') n++;
    return n;
  }

  /** Light thread from token to its target machine (C01). */
  private thread(token: Token): Line {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
    const mat = new LineBasicMaterial({
      color: new Color(Palette.risk(token.intent.risk.level)),
      transparent: true,
      opacity: 0.7,
    });
    const line = new Line(geo, mat);
    line.frustumCulled = false;
    line.name = `thread:${token.id}`;
    return line;
  }

  private leave(id: string, place: 'leaving' | 'gone'): void {
    const v = this.stage.views.get(id);
    if (!v) return;
    v.moveTo(Layout.LEDGER, place);
    if (this.stage.focus === id) this.stage.focus = null;
  }

  /** Re-pack tray spots after tokens leave. */
  private reflow(): void {
    let i = 0;
    for (const v of this.stage.views.values()) {
      if (v.place !== 'tray') continue;
      const spot = Layout.traySpot(i++);
      if (v.home.x !== spot[0] || v.home.y !== spot[1] || v.home.z !== spot[2]) v.moveTo(spot, 'tray');
    }
  }

  update(delta: number): void {
    this.app.tick(delta);
    this.reflow();
    const now = this.app.clock.ms;
    for (const [id, v] of this.stage.views) {
      const obj = v.object;
      const grabbed = v.entity.hasComponent(Grabbed);
      if (!grabbed && v.place !== 'grabbed') {
        v.tween = Math.min(1, v.tween + delta * (v.place === 'leaving' ? 1.6 : 2.4));
        const k = v.tween;
        const ease = v.place === 'tray' && v.from.y > v.home.y + 0.1 ? IntentQueueSystem.bounce(k) : 1 - Math.pow(1 - k, 3);
        obj.position.lerpVectors(v.from, v.home, ease);
        // inspected tokens lift; dying tokens sink into the tray (C29)
        const lifted = this.stage.focus === id && (v.place === 'tray' || v.place === 'rack');
        v.lift += ((lifted ? 1 : 0) - v.lift) * Math.min(1, delta * 8);
        const sink = v.place === 'tray' ? (1 - v.token.life(now)) * 0.009 : 0;
        obj.position.y += v.lift * 0.05 - sink;
        if (v.place === 'leaving' || v.place === 'gone') {
          obj.scale.setScalar(Math.max(0.001, 1 - k));
          if (k >= 1) this.dispose(id);
          continue;
        }
      }
      this.updateThread(v);
    }
  }

  private updateThread(v: TokenView): void {
    const line = v.thread as Line | null;
    if (!line) return;
    const rig = this.stage.rigs.get(v.token.intent.target.asset_id);
    const show = (v.place === 'tray' || v.place === 'grabbed' || v.place === 'slot') && !!rig;
    line.visible = show;
    if (!show || !rig) return;
    v.object.getWorldPosition(this.a);
    rig.root.getWorldPosition(this.b);
    this.stage.toDesk(this.a);
    this.stage.toDesk(this.b);
    this.b.y += 0.05;
    const pos = line.geometry.getAttribute('position') as BufferAttribute;
    pos.setXYZ(0, this.a.x, this.a.y + 0.008, this.a.z);
    pos.setXYZ(1, this.b.x, this.b.y, this.b.z);
    pos.needsUpdate = true;
  }

  private dispose(id: string): void {
    const v = this.stage.views.get(id);
    if (!v) return;
    v.thread?.removeFromParent();
    v.place = 'gone';
    this.stage.views.delete(id);
    v.entity.dispose();
  }

  /** Drop with a small settle bounce. */
  static bounce(t: number): number {
    if (t < 0.7) return Math.pow(t / 0.7, 2);
    const u = (t - 0.7) / 0.3;
    return 1 + Math.sin(u * Math.PI) * 0.06 * (1 - u);
  }
}
