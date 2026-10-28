import { CanvasTexture, SRGBColorSpace } from '@iwsdk/core';
import type { AgentSpec } from '../contracts/scenario';
import type { Glyph } from '../core/glyph';
import { Palette } from './palette';

/**
 * Canvas art for hash glyphs and agent sigils. Token and seal call the same
 * `glyph()` with the same Glyph, so the stamped rune always matches (C10).
 */
export class GlyphArt {
  private static readonly glyphs = new Map<string, CanvasTexture>();
  private static readonly sigils = new Map<string, CanvasTexture>();

  static glyph(glyph: Glyph, ink = '#2b2622', paper = '#efe4cf'): CanvasTexture {
    const key = `${glyph.key}|${ink}|${paper}`;
    const hit = GlyphArt.glyphs.get(key);
    if (hit) return hit;
    const size = 256;
    const c = Palette.canvas(size, size);
    const g = c.getContext('2d')!;
    const mid = size / 2;
    g.fillStyle = paper;
    g.beginPath();
    g.arc(mid, mid, mid - 2, 0, Math.PI * 2);
    g.fill();
    // outer ring with notches (rotation and count from the hash)
    g.strokeStyle = ink;
    g.lineWidth = 10;
    g.beginPath();
    g.arc(mid, mid, mid - 16, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < glyph.notches; i++) {
      const a = glyph.turn * Math.PI * 2 + (i / glyph.notches) * Math.PI * 2;
      g.beginPath();
      g.moveTo(mid + Math.cos(a) * (mid - 30), mid + Math.sin(a) * (mid - 30));
      g.lineTo(mid + Math.cos(a) * (mid - 8), mid + Math.sin(a) * (mid - 8));
      g.stroke();
    }
    // the rune: lattice strokes
    const s = mid * 0.5;
    g.lineWidth = 16;
    g.lineCap = 'round';
    for (const [x1, y1, x2, y2] of glyph.segments) {
      g.beginPath();
      g.moveTo(mid + x1 * s, mid - y1 * s);
      g.lineTo(mid + x2 * s, mid - y2 * s);
      g.stroke();
    }
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    GlyphArt.glyphs.set(key, tex);
    return tex;
  }

  static sigil(kind: AgentSpec['sigil'], colour = '#2b2622'): CanvasTexture {
    const key = `${kind}|${colour}`;
    const hit = GlyphArt.sigils.get(key);
    if (hit) return hit;
    const c = Palette.canvas(128, 128);
    const g = c.getContext('2d')!;
    g.strokeStyle = colour;
    g.fillStyle = colour;
    g.lineWidth = 14;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    if (kind === 'chevron') {
      g.moveTo(24, 44);
      g.lineTo(64, 84);
      g.lineTo(104, 44);
    } else if (kind === 'ring') {
      g.arc(64, 64, 36, 0, Math.PI * 2);
      g.moveTo(64, 64);
      g.arc(64, 64, 6, 0, Math.PI * 2);
    } else {
      g.moveTo(16, 64);
      g.bezierCurveTo(40, 24, 56, 24, 64, 64);
      g.bezierCurveTo(72, 104, 88, 104, 112, 64);
    }
    g.stroke();
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    GlyphArt.sigils.set(key, tex);
    return tex;
  }
}
