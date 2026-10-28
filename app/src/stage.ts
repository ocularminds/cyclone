import { Group, Matrix4, Quaternion, Vector3, type Entity, type Mesh, type Object3D } from '@iwsdk/core';
import type { Token } from './flow/shift';
import { Layout } from './models/layout';
import type { Rig } from './models/machines';
import type { TokenParts } from './models/token';

export type TokenPlace = 'arriving' | 'tray' | 'grabbed' | 'slot' | 'rack' | 'leaving' | 'gone';

/** Render-side state of one token on the desk. */
export class TokenView {
  place: TokenPlace = 'arriving';
  /** Desk-frame resting point (tray spot / slot / rack). */
  readonly home = new Vector3();
  readonly from = new Vector3();
  tween = 1;
  /** 0..1 lift while inspected. */
  lift = 0;
  thread: Object3D | null = null;
  holdTime = 0;
  /** Tray slot index; -1 when not in the tray. */
  spot = -1;
  /** Session ms of the last open-hand push (a pushed token drifts home after a pause). */
  pushedAt = -1;
  /** Seconds the hold has been broken; tolerates brief hand-tracking loss. */
  offTime = 0;
  hint: string | null = null;
  hintTime = 0;

  constructor(
    readonly token: Token,
    readonly entity: Entity,
    readonly parts: TokenParts,
  ) {}

  get object(): Object3D {
    return this.entity.object3D!;
  }

  /** Animate to a new resting point. */
  moveTo(p: Vector3 | readonly [number, number, number], place: TokenPlace): void {
    this.from.copy(this.object.position);
    if (p instanceof Vector3) this.home.copy(p);
    else this.home.set(p[0], p[1], p[2]);
    this.tween = 0;
    this.place = place;
  }
}

/**
 * Shared view-model between Cyclone's ECS systems: the desk frame, token
 * views, machine rigs, focus/scrub state and the user's head in desk space.
 */
export class Stage {
  /** Desk frame: origin on the near edge in front of the user, +z toward them. */
  readonly root = new Group();
  rootEntity: Entity | null = null;
  anchor: 'pending' | 'plane' | 'plinth' = 'pending';
  /** Desk boundary in desk-frame (x, z) — leaving it is a veto (C07, C22). */
  polygon: Array<[number, number]> = Stage.plinthPolygon();

  readonly views = new Map<string, TokenView>();
  readonly rigs = new Map<string, Rig>();
  readonly ghosts = new Map<string, Rig>();
  readonly machineEntities = new Map<string, Entity>();

  /** Execute slot parts (built by TwinSystem, animated by DecisionGestureSystem). */
  slot: { shutter: Mesh; ring: Mesh } | null = null;

  /**
   * Gaze/ray targets (card, slot, pad, chute, puck). They take ray events only
   * when eye gaze exists or eyes-only mode is on, so a hand ray hovering the
   * card can never steal the pinch meant for a near grab (DECISIONS.md).
   */
  readonly rayTargets: Entity[] = [];

  focus: string | null = null;
  detail = false;
  scrub = 0;
  /** True while a hold replays the ghost at real speed (C06). */
  holding = false;
  /** Label of the replay the ghost is playing (drill reveal, ledger seal), if any. */
  replay: string | null = null;
  settingsOpen = false;

  /** Head and gaze in desk frame, refreshed each frame by TwinSystem. */
  readonly head = new Vector3(...Layout.HEAD);
  readonly gaze = new Vector3(0, -0.6, -0.8).normalize();
  private readonly inverse = new Matrix4();
  private readonly q = new Quaternion();

  static plinthPolygon(): Array<[number, number]> {
    const [x0, x1] = Layout.PLINTH.x;
    const [z0, z1] = Layout.PLINTH.z;
    return [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ];
  }

  /** World → desk frame (in place). */
  toDesk(v: Vector3): Vector3 {
    this.root.updateWorldMatrix(true, false);
    this.inverse.copy(this.root.matrixWorld).invert();
    return v.applyMatrix4(this.inverse);
  }

  /** World direction → desk frame direction (in place). */
  dirToDesk(v: Vector3): Vector3 {
    this.root.getWorldQuaternion(this.q);
    return v.applyQuaternion(this.q.invert());
  }

  /** Point-in-polygon on the desk surface (x, z). */
  onDesk(x: number, z: number): boolean {
    let inside = false;
    const p = this.polygon;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, zi] = p[i];
      const [xj, zj] = p[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  /** Angle (degrees) between the gaze and the direction to a desk-frame point. */
  gazeAngle(at: Vector3, tmp: Vector3): number {
    tmp.copy(at).sub(this.head).normalize();
    return (Math.acos(Math.max(-1, Math.min(1, tmp.dot(this.gaze)))) * 180) / Math.PI;
  }
}
