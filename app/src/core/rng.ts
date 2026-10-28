/** Seeded mulberry32 PRNG — capture mode fixes the seed for reproducible runs (C47). */
export class Rng {
  private state: number;

  constructor(seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** RFC 4122 v4 UUID (matches the Intent v1 UUID pattern). */
  uuid(): string {
    const b = new Uint8Array(16);
    for (let i = 0; i < 16; i++) b[i] = Math.floor(this.next() * 256);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}
