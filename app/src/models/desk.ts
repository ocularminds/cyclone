import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import type { AgentSpec } from '../contracts/scenario';
import { GlyphArt } from './glyph';
import { Layout, type XYZ } from './layout';
import { Palette } from './palette';

/** Desk furniture: plinth, holding tray, execute slot, escalate pad, veto chute, rack, ledger shelf, puck, agents. */
export class Furniture {
  private static at<T extends Group | Mesh>(o: T, p: XYZ): T {
    o.position.set(p[0], p[1], p[2]);
    return o;
  }

  /** Fallback plinth at seated desk height (C20); its edge is the veto chute in VR (C22). */
  static plinth(): Group {
    const g = new Group();
    const [x0, x1] = Layout.PLINTH.x;
    const [z0, z1] = Layout.PLINTH.z;
    const h = Layout.PLINTH.height;
    const top = new Mesh(new BoxGeometry(x1 - x0, h, z1 - z0), Palette.matte(Palette.warm.sand));
    top.position.set((x0 + x1) / 2, -h / 2, (z0 + z1) / 2);
    g.add(top);
    const lip = new Mesh(new BoxGeometry(x1 - x0, 0.004, 0.006), Palette.matte(Palette.warm.walnut));
    lip.position.set((x0 + x1) / 2, 0.001, z1 - 0.003);
    g.add(lip);
    g.name = 'plinth';
    return g;
  }

  static tray(): Group {
    const g = new Group();
    const w = Layout.TRAY_SLOTS * Layout.TRAY_PITCH + 0.012;
    const base = new Mesh(new BoxGeometry(w, 0.006, 0.05), Palette.matte(Palette.warm.walnut));
    base.position.y = 0.003;
    g.add(base);
    for (let i = 0; i < Layout.TRAY_SLOTS; i++) {
      const well = new Mesh(new RingGeometry(0.018, 0.021, 24), Palette.matte(Palette.warm.cream));
      well.rotation.x = -Math.PI / 2;
      well.position.set((i - (Layout.TRAY_SLOTS - 1) / 2) * Layout.TRAY_PITCH, 0.0062, 0);
      g.add(well);
    }
    g.name = 'tray';
    return Furniture.at(g, Layout.TRAY);
  }

  /** Execute slot: a recessed ring with a lockable shutter (C05, C08). */
  static slot(): { root: Group; shutter: Mesh; ring: Mesh } {
    const g = new Group();
    const collar = new Mesh(new CylinderGeometry(0.03, 0.032, 0.01, 24), Palette.matte(Palette.warm.slate));
    collar.position.y = 0.005;
    g.add(collar);
    const ring = new Mesh(
      new RingGeometry(0.02, 0.026, 32),
      new MeshBasicMaterial({ color: new Color(Palette.RISK[0]) }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.0102;
    g.add(ring);
    const shutter = new Mesh(new BoxGeometry(0.05, 0.004, 0.012), Palette.matte(Palette.warm.terracotta));
    shutter.position.y = 0.012;
    shutter.visible = false;
    g.add(shutter);
    const cross = shutter.clone();
    cross.rotation.y = Math.PI / 2;
    shutter.add(cross);
    cross.position.set(0, 0, 0);
    g.name = 'slot';
    return { root: Furniture.at(g, Layout.SLOT), shutter, ring };
  }

  /** Escalate pad: a raised square with an up-chevron (C09). */
  static pad(): Group {
    const g = new Group();
    const base = new Mesh(new BoxGeometry(0.05, 0.006, 0.05), Palette.matte(Palette.warm.cream));
    base.position.y = 0.003;
    g.add(base);
    const mark = new Mesh(
      new PlaneGeometry(0.034, 0.034),
      new MeshBasicMaterial({ map: GlyphArt.sigil('chevron', Palette.warm.slate), transparent: true }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = Math.PI;
    mark.position.y = 0.0062;
    g.add(mark);
    g.name = 'pad';
    return Furniture.at(g, Layout.PAD);
  }

  /** Veto chute marker on the near edge: magenta lip with hatching (C07). */
  static chute(): Group {
    const g = new Group();
    const lip = new Mesh(
      new PlaneGeometry(0.1, 0.03),
      new MeshBasicMaterial({ map: Palette.hatch(3, Palette.RISK[3]), transparent: true, opacity: 0.9 }),
    );
    lip.rotation.x = -Math.PI / 2;
    lip.position.y = 0.001;
    g.add(lip);
    g.name = 'chute';
    return Furniture.at(g, Layout.CHUTE);
  }

  static rack(): Group {
    const g = new Group();
    const post = new Mesh(new BoxGeometry(0.006, 0.07, 0.006), Palette.matte(Palette.warm.slate));
    post.position.set(0.024, 0.035, 0);
    g.add(post);
    const base = new Mesh(new BoxGeometry(0.05, 0.004, 0.09), Palette.matte(Palette.warm.walnut));
    base.position.set(0, 0.002, 0.017);
    g.add(base);
    g.name = 'rack';
    return Furniture.at(g, Layout.RACK);
  }

  /** Ledger shelf: three stepped tiers for seal crystals (C10). */
  static ledger(): Group {
    const g = new Group();
    for (let tier = 0; tier < 3; tier++) {
      const step = new Mesh(new BoxGeometry(0.1, 0.006, 0.026), Palette.matte(Palette.warm.walnut));
      step.position.set(0, 0.016 + tier * 0.034, -tier * 0.012);
      g.add(step);
    }
    for (const x of [-0.052, 0.052]) {
      const side = new Mesh(new BoxGeometry(0.004, 0.1, 0.05), Palette.matte(Palette.warm.walnut));
      side.position.set(x, 0.05, -0.012);
      g.add(side);
    }
    g.name = 'ledger';
    return Furniture.at(g, Layout.LEDGER);
  }

  /** Settings puck (C31): poke or gaze-pinch to open the panel. */
  static puck(): Group {
    const g = new Group();
    const disc = new Mesh(new CylinderGeometry(0.018, 0.02, 0.01, 24), Palette.matte(Palette.warm.ink));
    disc.position.y = 0.005;
    g.add(disc);
    const dot = new Mesh(new TorusGeometry(0.009, 0.002, 6, 20), Palette.matte(Palette.warm.cream));
    dot.rotation.x = Math.PI / 2;
    dot.position.y = 0.0105;
    g.add(dot);
    g.name = 'puck';
    return Furniture.at(g, Layout.PUCK);
  }

  /** Agent pedestal: sigil disc and a trust ring that fills (C17). */
  static agent(spec: AgentSpec, i: number): { root: Group; ring: Mesh; track: Mesh } {
    const g = new Group();
    const disc = new Mesh(new CylinderGeometry(0.022, 0.022, 0.006, 24), Palette.matte(Palette.warm.cream));
    g.add(disc);
    const mark = new Mesh(
      new PlaneGeometry(0.028, 0.028),
      new MeshBasicMaterial({ map: GlyphArt.sigil(spec.sigil), transparent: true, depthWrite: false }),
    );
    mark.position.set(0, 0.022, 0);
    g.add(mark);
    const track = new Mesh(
      new RingGeometry(0.026, 0.03, 48),
      new MeshBasicMaterial({ color: new Color(Palette.warm.slate), transparent: true, opacity: 0.4 }),
    );
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.0035;
    g.add(track);
    const ring = new Mesh(
      new RingGeometry(0.026, 0.03, 48, 1, 0, 0.0001),
      new MeshBasicMaterial({ color: new Color(Palette.RISK[0]) }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    g.add(ring);
    g.name = `agent:${spec.id}`;
    return { root: Furniture.at(g, Layout.agentSpot(i)), ring, track };
  }

  /** Re-shape a trust ring to show `fill` (0..1). */
  static setRing(ring: Mesh, fill: number): void {
    const theta = Math.max(0.0001, Math.min(1, fill)) * Math.PI * 2;
    ring.geometry.dispose();
    ring.geometry = new RingGeometry(0.026, 0.03, 48, 1, Math.PI / 2 - theta, theta);
  }
}
