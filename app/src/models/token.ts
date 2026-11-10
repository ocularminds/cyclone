import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from '@iwsdk/core';
import type { RiskLevel } from '../contracts/intent';
import type { AgentSpec } from '../contracts/scenario';
import type { Glyph } from '../core/glyph';
import { GlyphArt } from './glyph';
import { Layout } from './layout';
import { Palette } from './palette';

export type TokenParts = {
  root: Group;
  body: Mesh;
  glyph: Mesh;
  sigil: Mesh;
  halo: Mesh;
};

export type SealKind = 'approve' | 'amended' | 'reject' | 'escalate' | 'auto' | 'expired';

/**
 * Shape and hatching encode risk independently of colour and policy permission.
 */
export class Tokens {
  private static readonly shapes = new Map<RiskLevel, BufferGeometry>();

  /** Star polygon outline: n points, inner/outer ratio (1 = regular polygon). */
  static outline(level: RiskLevel): BufferGeometry {
    const hit = Tokens.shapes.get(level);
    if (hit) return hit;
    const n = [32, 3, 4, 4][level];
    const r = Layout.TOKEN_R;
    const shape = new Shape();
    const pts = n;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2 + (level === 3 ? Math.PI / 4 : Math.PI / 2);
      const rr = r;
      if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    shape.closePath();
    const geo = new ExtrudeGeometry(shape, { depth: Layout.TOKEN_H, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -Layout.TOKEN_H / 2, 0);
    Tokens.shapes.set(level, geo);
    return geo;
  }

  static token(level: RiskLevel, glyph: Glyph, sigil: AgentSpec['sigil']): TokenParts {
    const root = new Group();
    const hex = Palette.risk(level);
    const caps = new MeshLambertMaterial({ color: new Color(hex) });
    const sides = new MeshLambertMaterial({ map: Palette.hatch(level, hex) });
    const body = new Mesh(Tokens.outline(level), [caps, sides]);
    root.add(body);
    const glyphMesh = new Mesh(
      new CircleGeometry(Layout.TOKEN_R * (level === 1 ? 0.48 : 0.65), 32),
      new MeshBasicMaterial({ map: GlyphArt.glyph(glyph) }),
    );
    glyphMesh.rotation.x = -Math.PI / 2;
    glyphMesh.position.y = Layout.TOKEN_H / 2 + 0.0006;
    glyphMesh.userData.glyph = glyph.key;
    root.add(glyphMesh);
    const sigilMesh = new Mesh(
      new PlaneGeometry(0.012, 0.012),
      new MeshBasicMaterial({ map: GlyphArt.sigil(sigil), transparent: true, depthWrite: false }),
    );
    sigilMesh.position.set(0, Layout.TOKEN_H / 2 + 0.012, Layout.TOKEN_R * 0.2);
    root.add(sigilMesh);
    if (level === 3) {
      const lock = new Group();
      const shackle = new Mesh(new TorusGeometry(0.0035, 0.001, 4, 12, Math.PI), Palette.matte(Palette.warm.ink));
      const bolt = new Mesh(new CylinderGeometry(0.0035, 0.0035, 0.003, 4), Palette.matte(Palette.warm.ink));
      bolt.rotation.x = Math.PI / 2; bolt.position.y = -0.001;
      lock.add(shackle, bolt); lock.position.set(0.018, 0.015, 0); lock.name = 'blocked-lock'; root.add(lock);
    }
    // halo: onboarding glow and selection ring (shared ghost-pass budget: additive, tiny)
    const halo = new Mesh(
      new TorusGeometry(Layout.TOKEN_R * 1.35, 0.0016, 6, 40),
      new MeshBasicMaterial({ color: new Color(hex), transparent: true, opacity: 0, depthWrite: false }),
    );
    halo.rotation.x = Math.PI / 2;
    root.add(halo);
    root.name = 'token';
    return { root, body, glyph: glyphMesh, sigil: sigilMesh, halo };
  }

  /** Swap the glyph texture after an amendment (new hash → new rune). */
  static setGlyph(parts: TokenParts, glyph: Glyph): void {
    (parts.glyph.material as MeshBasicMaterial).map = GlyphArt.glyph(glyph);
    (parts.glyph.material as MeshBasicMaterial).needsUpdate = true;
    parts.glyph.userData.glyph = glyph.key;
  }

  /** Timeline handle (C03): a pinchable bead on a rail pointing at the user. */
  static handle(): { root: Group; bead: Mesh } {
    const root = new Group();
    const bead = new Mesh(new SphereGeometry(0.009, 16, 12), Palette.matte(Palette.warm.cream));
    root.add(bead);
    const ring = new Mesh(new TorusGeometry(0.011, 0.0018, 6, 24), Palette.matte(Palette.warm.ink));
    ring.rotation.x = Math.PI / 2;
    root.add(ring);
    root.name = 'handle';
    return { root, bead };
  }

  static rail(length: number): Mesh {
    const rail = new Mesh(new CylinderGeometry(0.0015, 0.0015, length, 6), Palette.matte(Palette.warm.slate));
    rail.rotation.x = Math.PI / 2;
    rail.name = 'rail';
    return rail;
  }

  /** Parameter dial (C04): knurled knob with a pointer notch. */
  static dial(): Group {
    const root = new Group();
    const knob = new Mesh(new CylinderGeometry(0.016, 0.017, 0.014, 16), Palette.matte(Palette.warm.slate));
    root.add(knob);
    const notch = new Mesh(new CylinderGeometry(0.0025, 0.0025, 0.016, 6), Palette.matte(Palette.warm.mustard));
    notch.position.set(0, 0.001, -0.011);
    root.add(notch);
    for (let i = 0; i < 12; i++) {
      const rib = new Mesh(new CylinderGeometry(0.0012, 0.0012, 0.0142, 4), Palette.matte(Palette.warm.ink));
      const a = (i / 12) * Math.PI * 2;
      rib.position.set(Math.cos(a) * 0.0165, 0, Math.sin(a) * 0.0165);
      root.add(rib);
    }
    root.name = 'dial';
    return root;
  }

  /** Seal crystal stamped with the decision glyph (C10). */
  static seal(kind: SealKind, glyph: Glyph, verified: boolean): Group {
    const root = new Group();
    const tint: Record<SealKind, string> = {
      approve: Palette.RISK[0], amended: Palette.RISK[1], reject: Palette.warm.slate,
      escalate: Palette.warm.sand, auto: Palette.RISK[0], expired: Palette.warm.slate,
    };
    const crystal = new Mesh(
      new OctahedronGeometry(0.0085, 0),
      new MeshLambertMaterial({ color: new Color(tint[kind]), wireframe: kind === 'escalate' }),
    );
    crystal.position.y = 0.0125;
    crystal.scale.set(1, 1.35, 1);
    root.add(crystal);
    const base = new Mesh(new CylinderGeometry(0.0085, 0.0095, 0.004, 16), Palette.matte(Palette.warm.walnut));
    base.position.y = 0.002;
    root.add(base);
    const stamp = new Mesh(
      new CircleGeometry(0.0075, 24),
      new MeshBasicMaterial({ map: GlyphArt.glyph(glyph, verified ? Palette.warm.ink : Palette.warm.slate), toneMapped: false }),
    );
    stamp.position.set(0, 0.0125, 0.0105);
    stamp.name = 'seal-stamp';
    root.add(stamp);
    root.name = 'seal';
    return root;
  }

  static sealProof(root: Group, glyph: Glyph, verified: boolean): void {
    const stamp = root.getObjectByName('seal-stamp') as Mesh;
    const material = stamp.material as MeshBasicMaterial;
    material.map = GlyphArt.glyph(glyph, verified ? Palette.warm.ink : Palette.warm.slate);
    material.needsUpdate = true;
    root.userData.proof = verified ? 'checked' : 'unverified';
  }

  /** An offered trust rule (C17): a tablet you pick up and drop on an agent. */
  static ruleTablet(): Group {
    const root = new Group();
    const slab = new Mesh(new CylinderGeometry(0.016, 0.016, 0.008, 6), Palette.matte(Palette.warm.cream));
    root.add(slab);
    const rim = new Mesh(
      new TorusGeometry(0.018, 0.0016, 6, 24),
      new MeshBasicMaterial({ color: new Color(Palette.RISK[0]) }),
    );
    rim.rotation.x = Math.PI / 2;
    root.add(rim);
    root.name = 'rule';
    return root;
  }
}
