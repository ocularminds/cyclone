import { Canon } from './canon';

export type Segment = readonly [number, number, number, number];

/**
 * A deterministic rune drawn from the first 8 bytes of an intent hash (C10).
 * Each byte picks one stroke between two of the nine points of a 3×3 lattice,
 * so any change to the binding changes the hash and, visibly, the glyph.
 * Token and seal both render through `Glyph.from(hash)`, guaranteeing a match.
 */
export class Glyph {
  /** 3×3 lattice in unit space, origin centre, +y up. */
  private static readonly POINTS: ReadonlyArray<readonly [number, number]> = [
    [-1, 1], [0, 1], [1, 1],
    [-1, 0], [0, 0], [1, 0],
    [-1, -1], [0, -1], [1, -1],
  ];
  /** All 36 distinct lattice edges; a byte indexes this table. */
  private static readonly EDGES: ReadonlyArray<readonly [number, number]> = (() => {
    const out: Array<[number, number]> = [];
    for (let a = 0; a < 9; a++) for (let b = a + 1; b < 9; b++) out.push([a, b]);
    return out;
  })();

  readonly key: string;
  readonly segments: Segment[];
  /** 0..1 — drives the ring notch count/rotation so near-identical runes still differ. */
  readonly turn: number;
  readonly notches: number;

  private constructor(bytes: Uint8Array) {
    this.key = Canon.hex(bytes);
    const seen = new Set<number>();
    this.segments = [];
    for (const byte of bytes) {
      const edge = byte % Glyph.EDGES.length;
      if (seen.has(edge)) continue;
      seen.add(edge);
      const [a, b] = Glyph.EDGES[edge];
      const [x1, y1] = Glyph.POINTS[a];
      const [x2, y2] = Glyph.POINTS[b];
      this.segments.push([x1, y1, x2, y2]);
    }
    this.turn = bytes[0] / 255;
    this.notches = 3 + (bytes[7] % 5);
  }

  static from(hash: string): Glyph {
    const hex = hash.replace(/^sha256:/, '');
    if (!/^[0-9a-f]{16,}$/.test(hex)) throw new Error('GLYPH_BAD_HASH');
    return new Glyph(Canon.fromHex(hex.slice(0, 16)));
  }

  equals(other: Glyph): boolean {
    return this.key === other.key;
  }

  /** Short human-checkable form, e.g. "3f9a·c210". */
  get label(): string {
    return `${this.key.slice(0, 4)}·${this.key.slice(4, 8)}`;
  }
}
