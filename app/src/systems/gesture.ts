import {
  Color,
  createSystem,
  Grabbed,
  type Mesh,
  type MeshBasicMaterial,
  Pressed,
  RayInteractable,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import type { Cyclone } from '../app';
import { Station, TokenTag } from '../components';
import type { DecisionKind, Gesture } from '../contracts/intent';
import { Layout } from '../models/layout';
import { Palette } from '../models/palette';
import type { Stage, TokenView } from '../stage';

/**
 * DecisionGestureSystem (C05–C09, C22, C25, C26): reads the body, not buttons.
 * Place in the execute slot · two-hand dead-man's hold for 1.5 s (let go to
 * abort) · one hand + sustained gaze on the seal · push or drop the token off
 * the real desk edge to veto · place on the escalate pad · gaze + pinch on a
 * station in eyes-only mode. Enforces `policy.requires` through Shift.
 */
export class DecisionGestureSystem extends createSystem({
  tokens: { required: [TokenTag] },
  grabbed: { required: [TokenTag, Grabbed] },
  stationPressed: { required: [Station, Pressed] },
}) {
  static readonly HOLD_SECONDS = 1.5;
  static readonly PALM_RADIUS = 0.075;
  /** A hand must be off the token this long to abort (one dropped tracking frame must not). */
  static readonly RELEASE_GRACE = 0.15;
  private app!: Cyclone;
  private stage!: Stage;
  private shutter!: Mesh;
  private ring!: Mesh;
  private readonly p = new Vector3();
  private readonly left = new Vector3();
  private readonly right = new Vector3();
  private readonly prevL = new Vector3();
  private readonly prevR = new Vector3();
  private readonly tmp = new Vector3();
  private readonly slotSeal = new Vector3(Layout.SLOT[0], 0.03, Layout.SLOT[2]);
  private holdCue = false;
  private readonly white = new Color('#ffffff');

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    this.shutter = this.stage.slot!.shutter;
    this.ring = this.stage.slot!.ring;
    this.cleanupFuncs.push(
      this.queries.grabbed.subscribe('disqualify', (e) => this.onRelease(e)),
      this.queries.stationPressed.subscribe('qualify', (e) => this.onStationPinch(e)),
      this.app.shift.events.on('refused', ({ token, reason }) => {
        const v = this.stage.views.get(token.id);
        this.app.cue('lock', reason, v ? [v.home.x, v.home.y, v.home.z] : undefined, token.intent.risk.level);
        this.app.bus.emit('toast', { text: reason, tone: 'warn' });
        if (v && v.place !== 'tray') this.toTray(v);
      }),
      this.app.shift.events.on('denied', ({ token, reason }) => {
        const v = this.stage.views.get(token.id);
        this.app.cue('deny', `Policy gate denied the amendment: ${reason}`, v ? [v.home.x, v.home.y, v.home.z] : undefined);
        this.app.bus.emit('toast', { text: `Denied: ${reason}`, tone: 'warn' });
        if (v) this.toTray(v);
      }),
    );
  }

  private toTray(v: TokenView): void {
    v.spot = -1; // the queue re-packs it into a free tray spot
    v.moveTo(v.home, 'tray');
    v.place = 'tray';
    v.holdTime = 0;
    this.stage.holding = false;
  }

  private deskPos(v: TokenView, out: Vector3): Vector3 {
    v.object.getWorldPosition(out);
    return this.stage.toDesk(out);
  }

  private near(p: Vector3, at: readonly number[], r: number): boolean {
    return Math.hypot(p.x - at[0], p.z - at[2]) <= r && p.y < 0.09;
  }

  private decide(v: TokenView, kind: DecisionKind, gesture: Gesture): void {
    const id = v.token.id;
    void this.app.shift.decide(id, kind, gesture).then((rec) => {
      if (!rec && v.place !== 'leaving' && v.place !== 'gone' && v.token.status === 'held') this.toTray(v);
    });
  }

  /** Released a grabbed token: where did it land? */
  private onRelease(e: Entity): void {
    const v = this.stage.views.get(e.getValue(TokenTag, 'intentId') as string);
    if (!v || v.token.status !== 'held') return;
    this.land(v, this.deskPos(v, this.p));
  }

  private land(v: TokenView, p: Vector3): void {
    const intent = v.token.intent;
    console.info(`[cyclone][land] ${intent.tool} desk=(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}) onDesk=${this.stage.onDesk(p.x, p.z)}`);
    v.from.copy(p);
    if (!this.stage.onDesk(p.x, p.z)) {
      // over the edge: into the veto chute (real desk edge or plinth edge)
      v.moveTo([p.x, p.y - 0.3, p.z + 0.05], 'leaving');
      this.app.cue('veto', `Vetoed: ${intent.summary ?? intent.tool}`, [p.x, p.y, p.z]);
      this.decide(v, 'REJECT', 'veto_push');
      return;
    }
    // the nearer of slot and pad wins where their capture zones overlap
    const dSlot = Math.hypot(p.x - Layout.SLOT[0], p.z - Layout.SLOT[2]);
    const dPad = Math.hypot(p.x - Layout.PAD[0], p.z - Layout.PAD[2]);
    if (dSlot <= dPad && this.near(p, Layout.SLOT, Layout.SLOT_RADIUS * 1.6)) {
      if (intent.policy.requires === 'forbidden') {
        this.lockFlash = 1;
        this.decide(v, 'APPROVE', 'place'); // refused by policy → lock cue + back to tray
        return;
      }
      v.moveTo([Layout.SLOT[0], 0.018, Layout.SLOT[2]], 'slot');
      if (intent.policy.requires === 'single') {
        this.decide(v, 'APPROVE', 'place');
      } else {
        this.app.cue('hold', this.app.settings.get('oneHanded') ? 'Critical: hold it with one hand and look at the seal' : 'Critical: hold it with both hands for 1.5 seconds');
      }
      return;
    }
    if (dPad < dSlot && this.near(p, Layout.PAD, Layout.PAD_RADIUS * 1.6)) {
      v.moveTo([Layout.PAD[0], 0.014, Layout.PAD[2]], 'slot');
      this.app.cue('escalate', `Escalated for a second reviewer: ${intent.summary ?? intent.tool}`, [p.x, p.y, p.z]);
      this.decide(v, 'ESCALATE', 'escalate_place');
      return;
    }
    this.toTray(v);
  }

  /** Gaze + pinch (or poke) on a station decides for the inspected token in eyes-only mode (C25). */
  private onStationPinch(e: Entity): void {
    const kind = e.getValue(Station, 'kind') as string;
    if (kind === 'puck') return;
    const id = this.stage.focus;
    const v = id ? this.stage.views.get(id) : undefined;
    if (!v || v.token.status !== 'held') return;
    if (!this.app.settings.get('eyesOnly')) {
      if (kind === 'slot') this.app.bus.emit('toast', { text: 'Place the token in the slot, or turn on eyes-only mode.', tone: 'info' });
      return;
    }
    if (kind === 'slot') {
      v.moveTo([Layout.SLOT[0], 0.018, Layout.SLOT[2]], 'slot');
      this.decide(v, 'APPROVE', 'gaze_pinch');
    } else if (kind === 'pad') {
      v.moveTo([Layout.PAD[0], 0.014, Layout.PAD[2]], 'slot');
      this.decide(v, 'ESCALATE', 'gaze_pinch');
    } else if (kind === 'chute') {
      v.moveTo([Layout.CHUTE[0], -0.3, Layout.CHUTE[2] + 0.05], 'leaving');
      this.app.cue('veto', `Vetoed: ${v.token.intent.summary ?? v.token.intent.tool}`, [...Layout.CHUTE]);
      this.decide(v, 'REJECT', 'gaze_pinch');
    }
  }

  private lockFlash = 0;

  private hands(): { l: boolean; r: boolean } {
    const xr = this.input.xr;
    const l = !!xr.getPrimaryInputSource?.('left');
    const r = !!xr.getPrimaryInputSource?.('right');
    this.prevL.copy(this.left);
    this.prevR.copy(this.right);
    if (l) this.stage.toDesk(this.player.gripSpaces.left.getWorldPosition(this.left));
    if (r) this.stage.toDesk(this.player.gripSpaces.right.getWorldPosition(this.right));
    return { l, r };
  }

  private rayClock = 1;

  /** Gaze present (VR Glasses) or eyes-only → stations and card take gaze/ray pinches (C25). */
  private syncRayTargets(delta: number): void {
    this.rayClock += delta;
    if (this.rayClock < 0.5) return;
    this.rayClock = 0;
    const sources = this.world.session?.inputSources;
    let gaze = false;
    if (sources) for (const src of sources) if (src.targetRayMode === 'gaze') gaze = true;
    const want = gaze || this.app.settings.get('eyesOnly') || !this.world.session;
    for (const e of this.stage.rayTargets) {
      const has = e.hasComponent(RayInteractable);
      if (want && !has) e.addComponent(RayInteractable);
      if (!want && has) e.removeComponent(RayInteractable);
    }
  }

  update(delta: number): void {
    this.syncRayTargets(delta);
    const { l, r } = this.hands();
    this.slotState(delta);
    let holding = false;
    for (const v of this.stage.views.values()) {
      if (v.token.status !== 'held' || v.entity.hasComponent(Grabbed)) continue;
      this.deskPos(v, this.p);
      // push with an open hand: shove the resting token along the desk (C07)
      if (v.place === 'tray' || v.place === 'slot') {
        if (l) this.push(v, this.left, this.prevL);
        if (r) this.push(v, this.right, this.prevR);
      }
      if (v.place === 'slot' && v.token.intent.policy.requires === 'two_hand') {
        holding = this.hold(v, delta, l, r) || holding;
      }
    }
    this.stage.holding = holding;
    if (!holding) this.holdCue = false;
  }

  /**
   * Push with an open hand: if the palm's path this frame sweeps through a
   * resting token, the token is shoved ahead of the palm along the motion
   * (sweep test, so fast hands and coarse tracking still connect).
   */
  private push(v: TokenView, hand: Vector3, prev: Vector3): void {
    const mx = hand.x - prev.x;
    const mz = hand.z - prev.z;
    const len = Math.hypot(mx, mz);
    if (len < 0.0008 || len > 0.25 || Math.abs(hand.y - this.p.y) > 0.05) return;
    const ux = mx / len;
    const uz = mz / len;
    const cx = this.p.x - prev.x;
    const cz = this.p.z - prev.z;
    const along = cx * ux + cz * uz;
    if (along <= 0) return; // token is behind the palm's motion
    const t = Math.min(len, along);
    const reach = Layout.TOKEN_R + 0.02;
    if (Math.hypot(cx - ux * t, cz - uz * t) > reach) return;
    // keep the token just ahead of the palm
    const ahead = (this.p.x - hand.x) * ux + (this.p.z - hand.z) * uz;
    const shove = Math.max(0, reach - ahead);
    if (shove <= 0) return;
    const pushX = this.p.x + ux * shove;
    const pushZ = this.p.z + uz * shove;
    v.object.position.x += pushX - this.p.x;
    v.object.position.z += pushZ - this.p.z;
    v.home.set(v.home.x + pushX - this.p.x, v.home.y, v.home.z + pushZ - this.p.z);
    v.from.copy(v.home);
    v.tween = 1;
    v.pushedAt = this.app.clock.ms;
    this.p.set(pushX, this.p.y, pushZ);
    if (!this.stage.onDesk(pushX, pushZ)) this.land(v, this.p);
  }

  /** Dead-man's hold: both palms on the token (or one + gaze on the seal) for 1.5 s (C06, C26). */
  private hold(v: TokenView, delta: number, l: boolean, r: boolean): boolean {
    const R = DecisionGestureSystem.PALM_RADIUS;
    const lOn = l && this.left.distanceTo(this.p) < R;
    const rOn = r && this.right.distanceTo(this.p) < R;
    const oneHanded = this.app.settings.get('oneHanded');
    const gazeOnSeal = this.stage.gazeAngle(this.slotSeal, this.tmp) < 10;
    const both = lOn && rOn;
    const single = oneHanded && (lOn || rOn) && gazeOnSeal;
    if (both || single) {
      v.offTime = 0;
      if (!this.holdCue) {
        this.holdCue = true;
        this.app.cue('hold', both ? 'Holding with both hands…' : 'Holding with one hand and gaze…', [this.p.x, this.p.y, this.p.z], 2);
      }
      v.holdTime += delta;
      if (v.holdTime >= DecisionGestureSystem.HOLD_SECONDS) {
        v.holdTime = 0;
        this.decide(v, 'APPROVE', both ? 'two_hand_hold' : 'one_hand_gaze_hold');
        return false;
      }
      return true;
    }
    if (v.holdTime > 0) {
      v.offTime += delta;
      if (v.offTime < DecisionGestureSystem.RELEASE_GRACE) return true;
      // a hand let go before 1.5 s: abort, nothing is sent, the token returns
      v.holdTime = 0;
      v.offTime = 0;
      this.app.cue('lock', 'Hold released: aborted, nothing sent');
      this.toTray(v);
    }
    return false;
  }

  private slotState(delta: number): void {
    const id = this.stage.focus;
    const token = id ? this.app.shift.get(id) : undefined;
    const locked = token?.intent.policy.requires === 'forbidden' && token.status === 'held';
    this.shutter.visible = !!locked;
    this.lockFlash = Math.max(0, this.lockFlash - delta * 2);
    this.shutter.position.y = 0.012 + Math.sin(this.lockFlash * 20) * 0.003 * this.lockFlash;
    const level = token?.intent.risk.level ?? 0;
    const view = id ? this.stage.views.get(id) : undefined;
    const progress = view ? view.holdTime / DecisionGestureSystem.HOLD_SECONDS : 0;
    const mat = this.ring.material as MeshBasicMaterial;
    mat.color.set(locked ? Palette.risk(3) : Palette.risk(level));
    if (progress > 0) mat.color.lerp(this.white, progress);
  }
}
