import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  createSystem,
  EdgesGeometry,
  Grabbed,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  OneHandGrabbable,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import type { Cyclone } from '../app';
import { Control } from '../components';
import { Layout } from '../models/layout';
import { Machines, type Rig } from '../models/machines';
import { Palette } from '../models/palette';
import { Tokens } from '../models/token';
import { Motion, type Pose } from '../sim/kinematics';
import type { RehearsalResult } from '../sim/rehearsal';
import type { Stage } from '../stage';
import { Label } from '../ui/label';

type Replay = { result: RehearsalResult; t: number; label: string; loops: number };

/**
 * GhostRehearsalSystem (C03, C04, C06, C11, C16): pinch the timeline handle and
 * pull it toward you to scrub a translucent ghost along the commanded motion;
 * twist the dial to amend the value and the ghost re-rehearses live; the first
 * envelope crossing flares. Also plays the real-speed replay during a hold and
 * replays for drill reveals and ledger seals. Always a rehearsal from the
 * twin's kinematic model — never a prediction.
 */
export class GhostRehearsalSystem extends createSystem({
  grabbedControls: { required: [Control, Grabbed] },
}) {
  static readonly RAIL = 0.12;
  static readonly DEG_PER_STEP = 15;
  private app!: Cyclone;
  private stage!: Stage;
  private handle!: Entity;
  private handleRoot!: Group;
  private rail!: Mesh;
  private dial!: Entity;
  private dialRoot!: Group;
  private dialLabel!: Label;
  private ghost: Rig | null = null;
  private ghostAsset = '';
  private trail!: Line;
  private flare!: Mesh;
  private zoneBox!: LineSegments;
  private caption!: Label;
  private readonly pose: Pose = Motion.blank();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly q = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private dialStart = { yaw: 0, value: 0 };
  private lastStep = 0;
  private replay: Replay | null = null;
  private holdT = 0;
  private wiggle = { handle: 0, dial: 0 };
  private lastScrubCue = 0;

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    const root = this.stage.rootEntity!;

    const h = Tokens.handle();
    this.handleRoot = h.root;
    this.handle = this.world.createTransformEntity(h.root, { parent: root });
    this.handle.addComponent(Control, { intentId: '', kind: 'handle' });
    this.handle.addComponent(OneHandGrabbable, { rotate: false, translate: true });
    this.rail = Tokens.rail(GhostRehearsalSystem.RAIL);
    this.stage.root.add(this.rail);

    this.dialRoot = Tokens.dial();
    this.dial = this.world.createTransformEntity(this.dialRoot, { parent: root });
    this.dial.addComponent(Control, { intentId: '', kind: 'dial' });
    this.dial.addComponent(OneHandGrabbable, { rotate: true, translate: false });
    this.dialLabel = new Label(0.06, 0.018);
    this.dialRoot.add(this.dialLabel.mesh);
    this.dialLabel.mesh.position.set(0, 0.024, 0);

    const trailGeo = new BufferGeometry();
    trailGeo.setAttribute('position', new BufferAttribute(new Float32Array(64 * 3), 3));
    this.trail = new Line(trailGeo, new LineBasicMaterial({ color: new Color(Palette.ghost) }));
    this.trail.frustumCulled = false;
    this.flare = new Mesh(new SphereGeometry(0.012, 16, 12), Palette.flareMaterial);
    this.zoneBox = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 1, 1)),
      new LineBasicMaterial({ color: new Color(Palette.RISK[3]) }),
    );
    this.caption = new Label(0.16, 0.022);
    for (const o of [this.trail, this.flare, this.zoneBox, this.caption.mesh]) {
      o.visible = false;
      this.twinGroup().add(o);
    }
    this.setControlsVisible(false);

    this.cleanupFuncs.push(
      this.queries.grabbedControls.subscribe('qualify', (e) => {
        if (e === this.dial) {
          this.dialRoot.getWorldQuaternion(this.q);
          this.dialStart = { yaw: this.yawOf(this.q), value: this.focusToken()?.value ?? 0 };
          this.lastStep = 0;
        }
      }),
      this.queries.grabbedControls.subscribe('disqualify', (e) => {
        if (e === this.handle) this.placeHandle();
      }),
      this.app.bus.on('replay', ({ tool, asset_id, args, label }) => {
        const result = this.app.rehearsal.run(tool, asset_id, args);
        this.replay = { result, t: 0, label, loops: 2 };
      }),
      this.app.bus.on('hint', ({ hint }) => {
        if (hint === 'handle') this.wiggle.handle = 1.2;
        if (hint === 'dial') this.wiggle.dial = 1.2;
      }),
    );
  }

  private twinGroup(): Group {
    return this.stage.root.getObjectByName('twin') as Group;
  }

  private focusToken() {
    return this.stage.focus ? this.app.shift.get(this.stage.focus) : undefined;
  }

  private setControlsVisible(on: boolean, dial = on): void {
    this.handleRoot.visible = on;
    this.rail.visible = on;
    this.dialRoot.visible = dial;
  }

  /** Yaw of a world quaternion about world up (radians). */
  private yawOf(q: Quaternion): number {
    this.v.set(1, 0, 0).applyQuaternion(q);
    return Math.atan2(-this.v.z, this.v.x);
  }

  /** Rail origin (desk frame): just in front of the focused, lifted token. */
  private railStart(out: Vector3): Vector3 {
    const view = this.stage.focus ? this.stage.views.get(this.stage.focus) : undefined;
    if (!view) return out.set(0, 0.06, 0);
    // clear of the lifted token so a pinch on one never grabs the other
    return out.set(view.home.x, view.home.y + 0.03, view.home.z + Layout.TOKEN_R + 0.045);
  }

  private placeHandle(): void {
    this.railStart(this.v);
    this.handleRoot.position.set(this.v.x, this.v.y, this.v.z + this.stage.scrub * GhostRehearsalSystem.RAIL);
  }

  update(delta: number): void {
    const token = this.focusToken();
    const view = token ? this.stage.views.get(token.id) : undefined;
    const active = !!token && !!view && token.status === 'held' && (view.place === 'tray' || view.place === 'slot');
    const canAmend = active && !!token!.intent.amend && token!.intent.policy.requires !== 'forbidden';
    this.setControlsVisible(active, canAmend);
    if (token && this.handle.getValue(Control, 'intentId') !== token.id) {
      this.handle.setValue(Control, 'intentId', token.id);
      this.dial.setValue(Control, 'intentId', token.id);
      this.stage.scrub = 0;
      this.dialRoot.rotation.set(0, 0, 0);
    }
    if (active) this.controls(delta, token!.id);

    // which motion does the ghost show?
    let result: RehearsalResult | null = null;
    let t = this.stage.scrub;
    let caption = '';
    if (this.replay) {
      const r = this.replay;
      r.t += delta / Math.max(2.5, r.result.duration);
      if (r.t >= 1) {
        r.loops -= 1;
        r.t = r.loops > 0 ? 0 : 1;
        if (r.loops <= 0) this.replay = null;
      }
      result = r.result;
      t = Math.min(1, r.t);
      caption = r.label;
    } else if (token && active) {
      result = token.rehearsal;
      if (this.stage.holding) {
        this.holdT = (this.holdT + delta / Math.max(0.6, result.duration)) % 1;
        t = this.holdT;
        caption = 'Real-speed rehearsal';
      } else {
        this.holdT = 0;
        caption = `Rehearsal ${Math.round(t * 100)}%`;
      }
    }
    this.renderGhost(result, t, caption);
  }

  private controls(delta: number, id: string): void {
    this.railStart(this.w);
    this.rail.position.set(this.w.x, this.w.y, this.w.z + GhostRehearsalSystem.RAIL / 2);
    this.dialRoot.position.set(this.w.x - 0.06, this.w.y - 0.01, this.w.z + 0.01);
    if (this.handle.hasComponent(Grabbed)) {
      // project the pinched bead onto the rail: pulling toward you scrubs forward
      this.handleRoot.getWorldPosition(this.v);
      this.stage.toDesk(this.v);
      const s = Math.max(0, Math.min(1, (this.v.z - this.w.z) / GhostRehearsalSystem.RAIL));
      if (Math.abs(s - this.stage.scrub) > 0.002) {
        this.stage.scrub = s;
        if (this.app.clock.ms - this.lastScrubCue > 120) {
          this.lastScrubCue = this.app.clock.ms;
          this.app.cue('scrub', `Scrubbing the rehearsal: ${Math.round(s * 100)}%`);
        }
      }
    } else {
      this.placeHandle();
      if (this.wiggle.handle > 0) {
        this.wiggle.handle -= delta;
        this.handleRoot.position.z += Math.sin(this.wiggle.handle * 18) * 0.008 * this.wiggle.handle;
      }
    }
    const token = this.app.shift.get(id)!;
    const spec = token.intent.amend;
    if (spec && this.dial.hasComponent(Grabbed)) {
      this.dialRoot.getWorldQuaternion(this.q);
      let d = this.yawOf(this.q) - this.dialStart.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // clockwise (seen from above) increases the value
      const steps = Math.round((-d * 180) / Math.PI / GhostRehearsalSystem.DEG_PER_STEP);
      if (steps !== this.lastStep) {
        this.lastStep = steps;
        void this.app.shift.amend(id, this.dialStart.value + steps * spec.step).then((t) => {
          if (t) this.app.cue('scrub', `Amended to ${t.value}${spec.unit}${t.rehearsal.breach ? ' — still breaches' : ' — breach clear'}`);
        });
      }
    } else if (this.wiggle.dial > 0) {
      this.wiggle.dial -= delta;
      this.dialRoot.rotation.y = Math.sin(this.wiggle.dial * 16) * 0.35 * this.wiggle.dial;
    }
    if (spec) {
      const breach = token.rehearsal.breach;
      this.dialLabel.draw([{ text: `${token.value}${spec.unit}`, size: 0.011, weight: 700, color: breach ? '#a8287f' : '#2f6fb8' }], {
        background: '#f6efe2',
        align: 'center',
        padding: 0.003,
        radius: 0.004,
      });
      this.dialLabel.mesh.lookAt(this.v.copy(this.stage.head).applyMatrix4(this.stage.root.matrixWorld));
    }
  }

  private ensureGhost(assetId: string): Rig | null {
    if (this.ghostAsset === assetId && this.ghost) return this.ghost;
    this.ghost?.root.removeFromParent();
    const asset = this.app.rehearsal.asset(assetId);
    if (!asset) return null;
    this.ghost = Machines.build(asset, true);
    this.ghostAsset = assetId;
    this.twinGroup().add(this.ghost.root);
    return this.ghost;
  }

  private renderGhost(result: RehearsalResult | null, t: number, caption: string): void {
    const show = !!result;
    if (this.ghost) this.ghost.root.visible = show;
    this.trail.visible = this.flare.visible = this.zoneBox.visible = this.caption.mesh.visible = show;
    if (!result) return;
    const rig = this.ensureGhost(result.asset_id);
    if (!rig) return;
    const asset = this.app.rehearsal.asset(result.asset_id)!;
    this.app.rehearsal.poseAt(result.tool, result.asset_id, result.args, t, this.pose);
    this.applyPose(rig, asset.position, this.pose);

    // trail of the probe path
    const pos = this.trail.geometry.getAttribute('position') as BufferAttribute;
    const n = result.samples.length / 4;
    for (let i = 0; i < n; i++) pos.setXYZ(i, result.samples[i * 4], result.samples[i * 4 + 1], result.samples[i * 4 + 2]);
    pos.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, n);

    // breach flare at the exact crossing, bright once the ghost reaches it
    const b = result.breach;
    this.flare.visible = !!b;
    this.zoneBox.visible = !!b;
    if (b) {
      this.flare.position.set(...b.position);
      const reached = t >= b.t;
      const pulse = reached ? 1 + Math.sin(this.app.clock.ms / 70) * 0.35 : 0.45;
      this.flare.scale.setScalar(pulse);
      Palette.flareMaterial.opacity = reached ? 0.9 : 0.3;
      const zone = this.app.rehearsal.zone(b.zone_id);
      if (zone?.kind === 'box') {
        this.zoneBox.position.set((zone.min[0] + zone.max[0]) / 2, (zone.min[1] + zone.max[1]) / 2, (zone.min[2] + zone.max[2]) / 2);
        this.zoneBox.scale.set(zone.max[0] - zone.min[0], zone.max[1] - zone.min[1], zone.max[2] - zone.min[2]);
      } else {
        this.zoneBox.position.set(...b.position);
        this.zoneBox.scale.setScalar(0.07);
      }
      if (reached && !this.flared) {
        this.app.cue('risk', `Breach: ${b.zone_label}`, this.deskPoint(b.position), 3);
      }
      this.flared = reached;
    } else this.flared = false;

    this.caption.mesh.position.set(asset.position[0], 0.2, asset.position[2]);
    this.caption.mesh.lookAt(this.v.copy(this.stage.head).applyMatrix4(this.stage.root.matrixWorld));
    this.caption.draw([{ text: caption, size: 0.011, weight: 600, color: '#1d5f8f' }], {
      background: 'rgba(240,250,255,0.85)',
      align: 'center',
      padding: 0.004,
      radius: 0.005,
    });
  }

  private flared = false;

  private deskPoint(p: readonly [number, number, number]): [number, number, number] {
    return [p[0] + Layout.TWIN[0], p[1] + Layout.TWIN[1], p[2] + Layout.TWIN[2]];
  }

  /** Map a model pose onto a rig's movable part (shared with TwinSystem idle motion). */
  applyPose(rig: Rig, origin: readonly number[], pose: Pose): void {
    const part = rig.part;
    if (!part) return;
    switch (rig.kind) {
      case 'arm':
        part.rotation.y = (-pose.dof * Math.PI) / 180;
        break;
      case 'lift':
        part.position.set(pose.center[0] - origin[0], pose.center[1] - origin[1], pose.center[2] - origin[2]);
        break;
      case 'conveyor':
        part.position.x = pose.dof;
        break;
      case 'oven': {
        const heat = Math.max(0, Math.min(1, (pose.dof - 300) / 200));
        const col = rig.extras[0];
        if (col) {
          col.scale.y = 0.3 + heat * 1.4;
          col.position.y = 0.035 * col.scale.y;
        }
        part.scale.set(1, 0.3 + heat * 0.7, 1);
        break;
      }
    }
  }
}
