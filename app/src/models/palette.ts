import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from '@iwsdk/core';
import type { RiskLevel } from '../contracts/intent';

/**
 * "Precision miniature" art direction (C30): matte, warm, toy-like machines
 * against one cool translucent ghost. Risk uses blue / amber / magenta —
 * never red/green — and is always doubled by shape, motion, sound and
 * hatching (C23).
 */
export class Palette {
  static readonly RISK = ['#4a8fe0', '#e6b54a', '#e07a1f', '#d23aa6'] as const;
  static readonly RISK_HC = ['#3aa0ff', '#ffd400', '#ff8a00', '#ff3cd2'] as const;
  static readonly RISK_NAMES = ['low', 'moderate', 'high', 'critical'] as const;

  static readonly warm = {
    cream: '#efe4cf',
    sand: '#d9c7a4',
    terracotta: '#c86f4c',
    mustard: '#d6a63b',
    sage: '#93a88c',
    slate: '#5d6b78',
    walnut: '#6e4f37',
    ink: '#2b2622',
    steel: '#9aa3a8',
  } as const;

  static readonly ghost = '#8fdcff';

  private static readonly cache = new Map<string, MeshLambertMaterial>();
  private static highContrast = false;

  static matte(hex: string): MeshLambertMaterial {
    let m = Palette.cache.get(hex);
    if (!m) {
      m = new MeshLambertMaterial({ color: new Color(hex) });
      m.userData.base = hex;
      Palette.cache.set(hex, m);
    }
    return m;
  }

  /** The single shared transparent ghost material (one transparent pass, C40). */
  static readonly ghostMaterial = new MeshBasicMaterial({
    color: new Color(Palette.ghost),
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: DoubleSide,
  });

  static readonly flareMaterial = new MeshBasicMaterial({
    color: new Color('#ff3cd2'),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  static risk(level: RiskLevel): string {
    return (Palette.highContrast ? Palette.RISK_HC : Palette.RISK)[level];
  }

  /** High-contrast mode (C27): push every matte material towards black/white extremes. */
  static setHighContrast(on: boolean): void {
    Palette.highContrast = on;
    for (const m of Palette.cache.values()) {
      const base = new Color(m.userData.base as string);
      if (on) {
        const hsl = { h: 0, s: 0, l: 0 };
        base.getHSL(hsl);
        base.setHSL(hsl.h, Math.min(1, hsl.s * 1.4), hsl.l > 0.5 ? 0.92 : 0.12);
      }
      m.color.copy(base);
    }
    Palette.ghostMaterial.opacity = on ? 0.6 : 0.38;
  }

  static get isHighContrast(): boolean {
    return Palette.highContrast;
  }

  /** Hatching pattern per risk level: none, sparse, dense, cross-hatch (C23). */
  static hatch(level: RiskLevel, hex: string): CanvasTexture {
    const c = Palette.canvas(64, 64);
    const g = c.getContext('2d')!;
    g.fillStyle = hex;
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(20,16,12,0.75)';
    g.lineWidth = 5;
    const spacing = [0, 32, 16, 16][level];
    if (spacing) {
      for (let x = -64; x < 128; x += spacing) {
        g.beginPath();
        g.moveTo(x, 64);
        g.lineTo(x + 64, 0);
        g.stroke();
        if (level === 3) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + 64, 64);
          g.stroke();
        }
      }
    }
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(3, 1);
    return tex;
  }

  static canvas(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
}
