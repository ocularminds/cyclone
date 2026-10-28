import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { Palette } from '../models/palette';

export type Line = { text: string; size?: number; weight?: 400 | 600 | 700; color?: string };

export type LabelStyle = {
  background?: string;
  border?: string;
  padding?: number;
  align?: 'left' | 'center';
  radius?: number;
};

/**
 * Text on a plane via a canvas texture. Used for the decision card, captions,
 * toasts and desk labels: dynamic, crisp at arm's length, no extra fonts.
 */
export class Label {
  readonly mesh: Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private key = '';

  constructor(
    readonly width: number,
    readonly height: number,
    readonly pxPerMetre = 2400,
  ) {
    this.canvas = Palette.canvas(Math.round(width * pxPerMetre), Math.round(height * pxPerMetre));
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mat = new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(width, height), mat);
    this.mesh.renderOrder = 10;
  }

  /** Redraw only when the content changes. */
  draw(lines: Line[], style: LabelStyle = {}): void {
    const key = JSON.stringify([lines, style, Palette.isHighContrast]);
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext('2d')!;
    const { width: w, height: h } = this.canvas;
    const hc = Palette.isHighContrast;
    g.clearRect(0, 0, w, h);
    const pad = (style.padding ?? 0.012) * this.pxPerMetre;
    const r = (style.radius ?? 0.01) * this.pxPerMetre;
    if (style.background) {
      g.fillStyle = hc ? '#000000' : style.background;
      Label.round(g, 2, 2, w - 4, h - 4, r);
      g.fill();
      if (style.border || hc) {
        g.lineWidth = hc ? 8 : 4;
        g.strokeStyle = hc ? '#ffffff' : style.border!;
        g.stroke();
      }
    }
    let y = pad;
    g.textBaseline = 'top';
    g.textAlign = style.align === 'center' ? 'center' : 'left';
    const x = style.align === 'center' ? w / 2 : pad;
    for (const line of lines) {
      const size = (line.size ?? 0.012) * this.pxPerMetre;
      g.font = `${line.weight ?? 400} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      g.fillStyle = hc ? '#ffffff' : (line.color ?? '#2b2622');
      for (const row of Label.wrap(g, line.text, w - pad * 2)) {
        if (y + size > h - pad / 2) break;
        g.fillText(row, x, y);
        y += size * 1.25;
      }
      y += size * 0.25;
    }
    this.texture.needsUpdate = true;
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  private static wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
    const words = text.split(/\s+/);
    const rows: string[] = [];
    let row = '';
    for (const word of words) {
      const next = row ? `${row} ${word}` : word;
      if (g.measureText(next).width > max && row) {
        rows.push(row);
        row = word;
      } else row = next;
    }
    if (row) rows.push(row);
    return rows;
  }

  private static round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
}
