import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { Palette } from '../models/palette';
import { Fonts } from './fonts';

export type Line = { text: string; size?: number; weight?: 400 | 600 | 700; color?: string; display?: boolean; gap?: number };

export type LabelStyle = {
  background?: string;
  border?: string;
  padding?: number;
  align?: 'left' | 'center';
  radius?: number;
  /** Tiny noncritical machine labels may opt out; task panels always scale. */
  scaleText?: boolean;
};

/**
 * Text on a plane via a canvas texture. Used for the decision card, captions,
 * toasts and desk labels: dynamic, crisp at arm's length, using local fonts.
 */
export class Label {
  readonly mesh: Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private key = '';
  private pagesKey = '';
  private pagesValue: Line[][] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly pxPerMetre = 2400,
  ) {
    this.canvas = Palette.canvas(Math.round(width * pxPerMetre), Math.round(height * pxPerMetre));
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mat = new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false });
    this.mesh = new Mesh(new PlaneGeometry(width, height), mat);
    this.mesh.renderOrder = 10;
  }

  /** Redraw only when the content changes. */
  draw(lines: Line[], style: LabelStyle = {}): void {
    const key = JSON.stringify([lines, style, Palette.isHighContrast, Palette.theme, Palette.textScale, Fonts.revision]);
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext('2d')!;
    const { width: w, height: h } = this.canvas;
    const hc = Palette.isHighContrast;
    g.clearRect(0, 0, w, h);
    const pad = (style.padding ?? 0.012) * this.pxPerMetre;
    const r = (style.radius ?? 0.01) * this.pxPerMetre;
    if (style.background) {
      g.fillStyle = hc ? Palette.ui.surface : style.background;
      Label.round(g, 2, 2, w - 4, h - 4, r);
      g.fill();
      if (style.border || hc) {
        g.lineWidth = hc ? 8 : 4;
        g.strokeStyle = hc ? Palette.ui.border : style.border!;
        g.stroke();
      }
    }
    let y = pad;
    g.textBaseline = 'top';
    g.textAlign = style.align === 'center' ? 'center' : 'left';
    const x = style.align === 'center' ? w / 2 : pad;
    let overflow = false;
    const rendered: Array<{ text: string; font: string; emMetres: number }> = [];
    for (const line of lines) {
      const em = (line.size ?? 0.009) * (style.scaleText === false ? 1 : Palette.textScale);
      const size = em * this.pxPerMetre;
      g.font = Fonts.css(size, line.weight ?? 400, line.display);
      g.fontKerning = 'none';
      g.fillStyle = line.color ?? Palette.ui.text;
      for (const row of Label.wrap(g, line.text, w - pad * 2)) {
        if (y + size > h - pad / 2) { overflow = true; break; }
        g.fillText(row, x, y);
        rendered.push({ text: row, font: g.font, emMetres: em });
        y += size * 1.25;
      }
      y += size * (line.gap ?? 0.1);
    }
    this.mesh.userData.label = { rendered, overflow, textScale: Palette.textScale, fonts: Fonts.status, width: this.width, height: this.height };
    this.texture.needsUpdate = true;
  }

  /** Reflow long evidence using the loaded renderer metrics, without shrinking its type. */
  paginate(lines: Line[], style: LabelStyle = {}, repeat = 0): Line[][] {
    const key = JSON.stringify([lines, style, repeat, Palette.textScale, Fonts.revision]);
    if (key === this.pagesKey) return this.pagesValue;
    const g = this.canvas.getContext('2d')!, pad = (style.padding ?? 0.012) * this.pxPerMetre;
    const rows = (input: Line[]) => input.flatMap(line => {
      const size = (line.size ?? 0.009) * (style.scaleText === false ? 1 : Palette.textScale) * this.pxPerMetre;
      g.font = Fonts.css(size, line.weight ?? 400, line.display); g.fontKerning = 'none';
      const wrapped = Label.wrap(g, line.text, this.canvas.width - 2 * pad);
      return wrapped.map((text, i) => ({ ...line, text, gap: i === wrapped.length - 1 ? line.gap ?? 0.1 : 0 }));
    });
    const sizeOf = (line: Line) => (line.size ?? 0.009) * (style.scaleText === false ? 1 : Palette.textScale) * this.pxPerMetre * (1.25 + (line.gap ?? 0.1));
    const header = rows(lines.slice(0, repeat)), body = rows(lines.slice(repeat));
    const headerHeight = header.reduce((sum, line) => sum + sizeOf(line), 0), limit = this.canvas.height - pad * 2;
    const pages: Line[][] = [[...header]]; let height = headerHeight;
    for (const row of body) {
      if (height + sizeOf(row) > limit && pages[pages.length - 1].length > header.length) { pages.push([...header]); height = headerHeight; }
      pages[pages.length - 1].push(row); height += sizeOf(row);
    }
    this.pagesKey = key; this.pagesValue = pages; return pages;
  }

  /** A short cue summary; longer decision reasons remain in the review pages. */
  caption(text: string): void {
    this.mesh.visible = text.length > 0;
    if (!text) return;
    const style = { background: Palette.ui.surface, border: Palette.ui.border, padding: 0.003, radius: 0.005 };
    const pages = this.paginate([{ text, size: 0.009, weight: 600, color: Palette.ui.text }], style);
    const rows = pages[0].map(row => ({ ...row }));
    if (pages.length > 1 && rows.length) rows[rows.length - 1].text = rows[rows.length - 1].text.slice(0, -3) + '...';
    this.draw(rows, style);
    this.mesh.userData.captionFullText = text;
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  private static wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
    const words = text.split(/\s+/);
    const rows: string[] = [];
    let row = '';
    for (const word of words) {
      if (g.measureText(word).width > max) {
        if (row) { rows.push(row); row = ''; }
        for (const char of word) {
          if (row && g.measureText(row + char).width > max) { rows.push(row); row = ''; }
          row += char;
        }
        continue;
      }
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
