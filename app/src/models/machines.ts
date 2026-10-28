import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Material,
  type Object3D,
} from '@iwsdk/core';
import type { AssetSpec } from '../sim/kinematics';
import type { BoxZone } from '../sim/envelope';
import { Palette } from './palette';

type Paint = (hex: string) => Material;

/** Movable parts a machine exposes to the twin animator and the ghost. */
export type Rig = {
  root: Group;
  kind: AssetSpec['kind'];
  /** arm: yaw pivot · lift: carriage · conveyor: box carrier · oven: heat glow. */
  part: Object3D | null;
  extras: Object3D[];
};

const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 14) => new CylinderGeometry(r, r, h, seg);

/**
 * Procedural low-poly machines for the 1:10 tabletop twin. The same builders
 * make the cool translucent ghost by swapping the paint (C30, C40).
 */
export class Machines {
  static build(asset: AssetSpec, ghost = false): Rig {
    const paint: Paint = ghost ? () => Palette.ghostMaterial : (hex) => Palette.matte(hex);
    let rig: Rig;
    switch (asset.kind) {
      case 'conveyor':
        rig = Machines.conveyor(paint, asset.params.length ?? 0.22, ghost);
        break;
      case 'arm':
        rig = Machines.arm(paint, asset.params.reach ?? 0.1, asset.params.height ?? 0.06, ghost);
        break;
      case 'oven':
        rig = Machines.oven(paint, ghost);
        break;
      case 'lift':
        rig = Machines.lift(paint, asset.params, ghost);
        break;
      default:
        rig = Machines.shelf(paint, asset.params);
    }
    rig.root.position.set(...asset.position);
    rig.root.name = `${ghost ? 'ghost' : 'machine'}:${asset.id}`;
    return rig;
  }

  private static add(parent: Object3D, mesh: Mesh, x: number, y: number, z: number): Mesh {
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  static conveyor(paint: Paint, length: number, ghost: boolean): Rig {
    const root = new Group();
    const w = 0.045;
    if (!ghost) {
      Machines.add(root, new Mesh(box(length + 0.01, 0.006, w + 0.012), paint(Palette.warm.walnut)), 0, 0.003, 0);
      for (const x of [-length / 2 + 0.01, length / 2 - 0.01]) {
        Machines.add(root, new Mesh(box(0.008, 0.028, w), paint(Palette.warm.slate)), x, 0.017, 0);
      }
      Machines.add(root, new Mesh(box(length, 0.008, w), paint(Palette.warm.ink)), 0, 0.034, 0);
      for (const x of [-length / 2, length / 2]) {
        const roller = new Mesh(cyl(0.006, w + 0.004, 10), paint(Palette.warm.steel));
        roller.rotation.x = Math.PI / 2;
        Machines.add(root, roller, x, 0.034, 0);
      }
    }
    const carrier = new Group();
    root.add(carrier);
    const colours = [Palette.warm.sand, Palette.warm.mustard, Palette.warm.terracotta];
    for (let i = 0; i < 3; i++) {
      const parcel = new Mesh(box(0.022, 0.018, 0.022), paint(colours[i]));
      parcel.position.set(-length / 2 + 0.03 + i * (length / 3), 0.047, 0);
      carrier.add(parcel);
    }
    return { root, kind: 'conveyor', part: carrier, extras: [] };
  }

  static arm(paint: Paint, reach: number, height: number, ghost: boolean): Rig {
    const root = new Group();
    if (!ghost) {
      Machines.add(root, new Mesh(cyl(0.028, 0.012, 16), paint(Palette.warm.slate)), 0, 0.006, 0);
    }
    const yaw = new Group();
    yaw.position.y = 0.012;
    root.add(yaw);
    Machines.add(yaw, new Mesh(cyl(0.016, height - 0.012, 14), paint(Palette.warm.mustard)), 0, (height - 0.012) / 2, 0);
    const link = new Mesh(box(reach, 0.014, 0.016), paint(Palette.warm.mustard));
    Machines.add(yaw, link, reach / 2, height - 0.012, 0);
    Machines.add(yaw, new Mesh(cyl(0.011, 0.02, 12), paint(Palette.warm.ink)), reach, height - 0.024, 0);
    Machines.add(yaw, new Mesh(box(0.012, 0.01, 0.02), paint(Palette.warm.steel)), reach, height - 0.038, 0);
    return { root, kind: 'arm', part: yaw, extras: [] };
  }

  static oven(paint: Paint, ghost: boolean): Rig {
    const root = new Group();
    Machines.add(root, new Mesh(box(0.08, 0.07, 0.06), paint(Palette.warm.terracotta)), 0, 0.035, 0);
    const glowMat = ghost
      ? Palette.ghostMaterial
      : new MeshBasicMaterial({ color: '#3a2a20' });
    const glow = Machines.add(root, new Mesh(new PlaneGeometry(0.05, 0.03), glowMat), 0, 0.04, 0.0305);
    if (!ghost) {
      Machines.add(root, new Mesh(box(0.012, 0.03, 0.012), paint(Palette.warm.ink)), 0.025, 0.085, -0.015);
      Machines.add(root, new Mesh(box(0.084, 0.006, 0.064), paint(Palette.warm.walnut)), 0, 0.073, 0);
    }
    // thermometer column on the oven's right side
    const column = new Mesh(box(0.006, 0.06, 0.006), ghost ? Palette.ghostMaterial : paint(Palette.warm.cream));
    column.position.set(0.048, 0.035, 0.02);
    root.add(column);
    return { root, kind: 'oven', part: glow, extras: [column] };
  }

  static lift(paint: Paint, p: Record<string, number>, ghost: boolean): Rig {
    const root = new Group();
    if (!ghost) {
      for (const x of [-0.03, 0.03]) {
        Machines.add(root, new Mesh(box(0.006, 0.16, 0.006), paint(Palette.warm.slate)), x, 0.08, 0.026);
      }
      Machines.add(root, new Mesh(box(0.07, 0.008, 0.012), paint(Palette.warm.slate)), 0, 0.16, 0.026);
      Machines.add(root, new Mesh(box(0.07, 0.006, 0.07), paint(Palette.warm.walnut)), 0, 0.003, 0);
    }
    // the carriage carries the pallet; its local origin is the pallet centre
    const carriage = new Group();
    root.add(carriage);
    const hx = p.half_x ?? 0.025;
    const hy = p.half_y ?? 0.008;
    const hz = p.half_z ?? 0.02;
    Machines.add(carriage, new Mesh(box(hx * 2, hy * 2, hz * 2), paint(Palette.warm.sand)), 0, 0, 0);
    Machines.add(carriage, new Mesh(box(hx * 2, 0.012, 0.014), paint(Palette.warm.mustard)), 0, hy + 0.006, 0);
    return { root, kind: 'lift', part: carriage, extras: [] };
  }

  static shelf(paint: Paint, p: Record<string, number>): Rig {
    const root = new Group();
    const w = p.width ?? 0.12;
    const d = p.depth ?? 0.065;
    const beamY = p.beam_y ?? 0.105;
    const beamH = p.beam_h ?? 0.015;
    for (const x of [-w / 2, w / 2]) {
      for (const z of [-d / 2, d / 2]) {
        Machines.add(root, new Mesh(box(0.006, 0.17, 0.006), paint(Palette.warm.slate)), x, 0.085, z);
      }
    }
    Machines.add(root, new Mesh(box(w, beamH, d), paint(Palette.warm.terracotta)), 0, beamY + beamH / 2, 0);
    Machines.add(root, new Mesh(box(w, 0.006, d), paint(Palette.warm.walnut)), 0, 0.17, 0);
    return { root, kind: 'shelf', part: null, extras: [] };
  }

  /** Floor markings: walkway hatching and zone outlines — no human figures (C42). */
  static marking(zone: BoxZone): Mesh | null {
    if (!zone.marking || zone.marking === 'none') return null;
    const w = zone.max[0] - zone.min[0];
    const d = zone.max[2] - zone.min[2];
    const c = Palette.canvas(512, Math.max(64, Math.round((512 * d) / w)));
    const g = c.getContext('2d')!;
    if (zone.marking === 'walkway') {
      g.fillStyle = '#e6b54a';
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#2b2622';
      for (let x = -c.height; x < c.width; x += 40) {
        g.beginPath();
        g.moveTo(x, c.height);
        g.lineTo(x + 20, c.height);
        g.lineTo(x + 20 + c.height, 0);
        g.lineTo(x + c.height, 0);
        g.fill();
      }
    } else {
      g.strokeStyle = '#4a8fe0';
      g.lineWidth = 10;
      g.setLineDash([28, 18]);
      g.strokeRect(8, 8, c.width - 16, c.height - 16);
      g.fillStyle = '#4a8fe0';
      g.font = '700 46px system-ui, sans-serif';
      g.fillText('ZONE B', 26, 24);
    }
    const mesh = new Mesh(
      new PlaneGeometry(w, d),
      new MeshBasicMaterial({ map: Machines.texture(c), transparent: zone.marking === 'zone' }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((zone.min[0] + zone.max[0]) / 2, 0.0015, (zone.min[2] + zone.max[2]) / 2);
    mesh.name = `marking:${zone.id}`;
    return mesh;
  }

  private static texture(c: HTMLCanvasElement): CanvasTexture {
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }
}
