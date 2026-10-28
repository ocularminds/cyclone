import {
  AmbientLight,
  createSystem,
  DirectionalLight,
  Group,
  HemisphereLight,
  PokeInteractable,
  Quaternion,
  Vector3,
  VisibilityState,
  XRAnchor,
  XRPlane,
  type Entity,
} from '@iwsdk/core';
import type { Cyclone } from '../app';
import { Machine, Station } from '../components';
import { Furniture } from '../models/desk';
import { Layout } from '../models/layout';
import { Machines } from '../models/machines';
import type { BoxZone } from '../sim/envelope';
import { Stage } from '../stage';

type PlaneLike = { polygon: Array<{ x: number; z: number }>; orientation?: string; semanticLabel?: string };

/**
 * TwinSystem (C20, C22, C37): builds the desk frame, furniture and the 1:10
 * micro-factory; anchors it to a detected table plane, or after 3 s to a
 * fallback plinth at seated desk height; maps asset_id → entity; keeps the
 * user's head and gaze in desk space for every other system.
 */
export class TwinSystem extends createSystem({
  planes: { required: [XRPlane] },
}) {
  private app!: Cyclone;
  private stage!: Stage;
  private twin!: Group;
  private plinth!: Group;
  private waiting = 0;
  private sessionActive = false;
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly q = new Quaternion();
  private idle = 0;

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    const root = this.stage.root;
    root.name = 'desk';
    this.stage.rootEntity = this.world.createTransformEntity(root, { persistent: true });

    this.plinth = Furniture.plinth();
    root.add(this.plinth);
    this.station(Furniture.tray(), 'tray');
    const slot = Furniture.slot();
    this.stage.slot = { shutter: slot.shutter, ring: slot.ring };
    // slot, pad and chute are gaze/ray/poke targets for eyes-only mode (C25)
    for (const e of [this.station(slot.root, 'slot'), this.station(Furniture.pad(), 'pad'), this.station(Furniture.chute(), 'chute')]) {
      e.addComponent(PokeInteractable);
      this.stage.rayTargets.push(e);
    }
    this.station(Furniture.rack(), 'rack');
    this.station(Furniture.ledger(), 'shelf');

    this.twin = new Group();
    this.twin.name = 'twin';
    this.twin.position.set(...Layout.TWIN);
    const twinEntity = this.world.createTransformEntity(this.twin, { parent: this.stage.rootEntity, persistent: true });
    for (const zone of this.app.rehearsal.twin.zones) {
      if (zone.kind !== 'box') continue;
      const mark = Machines.marking(zone as BoxZone);
      if (mark) this.twin.add(mark);
    }
    for (const asset of this.app.rehearsal.twin.assets) {
      const rig = Machines.build(asset);
      const entity = this.world.createTransformEntity(rig.root, { parent: twinEntity, persistent: true });
      entity.addComponent(Machine, { assetId: asset.id });
      this.stage.rigs.set(asset.id, rig);
      this.stage.machineEntities.set(asset.id, entity);
    }

    const hemi = new HemisphereLight('#fff4e0', '#5a4a3a', 1.6);
    const sun = new DirectionalLight('#fff1dc', 1.2);
    sun.position.set(0.4, 1, 0.6);
    this.scene.add(hemi, sun, new AmbientLight('#ffffff', 0.25));

    this.queries.planes.subscribe('qualify', () => {
      if (this.stage.anchor !== 'plane') this.waiting = Math.min(this.waiting, 2.5);
    });
    this.cleanupFuncs.push(
      this.visibilityState.subscribe((s) => {
        const active = s !== VisibilityState.NonImmersive;
        if (active && !this.sessionActive) {
          this.stage.anchor = 'pending';
          this.waiting = 0;
        }
        this.sessionActive = active;
        if (!active) this.stage.anchor = 'pending';
      }),
      this.app.settings.changes.on('change', ({ key }) => {
        if (key === 'passthrough') this.applyPassthrough();
      }),
    );
  }

  private station(obj: Group, kind: 'tray' | 'slot' | 'pad' | 'chute' | 'rack' | 'shelf'): Entity {
    const e = this.world.createTransformEntity(obj, { parent: this.stage.rootEntity!, persistent: true });
    e.addComponent(Station, { kind });
    return e;
  }

  /** Passthrough off (VR) shows the plinth even over a real desk: the scene visibly changes (C22). */
  private applyPassthrough(): void {
    const vr = !this.app.settings.get('passthrough');
    this.plinth.visible = this.stage.anchor !== 'plane' || vr;
    if (vr && this.stage.anchor === 'plane') this.place('plinth');
  }

  /** Find the best table-height horizontal plane, if any. */
  private bestPlane(): { entity: Entity; plane: PlaneLike } | null {
    this.camera.getWorldPosition(this.v);
    let best: { entity: Entity; plane: PlaneLike; score: number } | null = null;
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as PlaneLike | undefined;
      const obj = entity.object3D;
      if (!plane || !obj || plane.orientation === 'vertical') continue;
      obj.getWorldPosition(this.w);
      const drop = this.v.y - this.w.y;
      if (drop < 0.15 || drop > 0.85) continue; // not desk height relative to a seated head
      const label = plane.semanticLabel ?? '';
      const score = (label === 'table' || label === 'desk' ? 10 : 0) - Math.abs(drop - Layout.SEATED_DESK_DROP);
      if (!best || score > best.score) best = { entity, plane, score };
    }
    return best;
  }

  /** Anchor the desk frame on a plane edge nearest the user, or drop to the plinth. */
  private place(mode: 'plane' | 'plinth', found?: { entity: Entity; plane: PlaneLike }): void {
    const root = this.stage.root;
    this.camera.getWorldPosition(this.v);
    this.camera.getWorldDirection(this.w); // look direction
    const yaw = Math.atan2(-this.w.x, -this.w.z); // +z of the desk frame points back at the user
    if (mode === 'plane' && found) {
      const obj = found.entity.object3D!;
      obj.updateWorldMatrix(true, false);
      // the plane's polygon in world space
      const pts = found.plane.polygon.map((p) => obj.localToWorld(new Vector3(p.x, 0, p.z)));
      const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      // nearest boundary point to the head (horizontal)
      let bestD = Infinity;
      const near = new Vector3();
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const ab = this.w.copy(b).sub(a);
        const t = Math.max(0, Math.min(1, ((this.v.x - a.x) * ab.x + (this.v.z - a.z) * ab.z) / (ab.x * ab.x + ab.z * ab.z || 1)));
        const px = a.x + ab.x * t;
        const pz = a.z + ab.z * t;
        const d = Math.hypot(px - this.v.x, pz - this.v.z);
        if (d < bestD) {
          bestD = d;
          near.set(px, y, pz);
        }
      }
      if (bestD > 0.6) return this.place('plinth');
      const faceYaw = Math.atan2(this.v.x - near.x, this.v.z - near.z);
      root.position.copy(near);
      root.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), faceYaw);
      root.updateWorldMatrix(true, false);
      this.stage.polygon = pts.map((p) => {
        const local = this.stage.toDesk(p.clone());
        return [local.x, local.z] as [number, number];
      });
      this.stage.anchor = 'plane';
      this.plinth.visible = !this.app.settings.get('passthrough');
      this.app.cue('drop', 'Desk found: the factory blooms on your table');
    } else {
      // plinth at seated desk height in front of the user
      this.q.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
      const offset = new Vector3(-Layout.HEAD[0], -Layout.HEAD[1], -Layout.HEAD[2]).applyQuaternion(this.q);
      root.position.copy(this.v).add(offset);
      root.quaternion.copy(this.q);
      this.stage.polygon = Stage.plinthPolygon();
      this.stage.anchor = 'plinth';
      this.plinth.visible = true;
    }
    const entity = this.stage.rootEntity!;
    if (this.sessionActive && !entity.hasComponent(XRAnchor)) entity.addComponent(XRAnchor);
    this.idle = 0;
  }

  update(delta: number): void {
    // head and gaze in desk frame for every other system
    if (!this.sessionActive && this.stage.anchor === 'pending') this.place('plinth');
    this.camera.getWorldPosition(this.v);
    this.stage.head.copy(this.stage.toDesk(this.v));
    this.camera.getWorldDirection(this.w);
    this.stage.gaze.copy(this.stage.dirToDesk(this.w)).normalize();

    if (this.sessionActive && this.stage.anchor === 'pending') {
      this.waiting += delta;
      const found = this.app.settings.get('passthrough') ? this.bestPlane() : null;
      if (found && this.waiting > 0.5) this.place('plane', found);
      else if (this.waiting >= 3) {
        this.place('plinth');
        this.app.cue('drop', 'No table found: using a plinth at desk height');
      }
    }
    // bloom-in on (re)anchor
    this.idle = Math.min(1, this.idle + delta * 1.5);
    const s = 0.2 + 0.8 * (1 - Math.pow(1 - this.idle, 3));
    this.twin.scale.setScalar(s);
  }
}
