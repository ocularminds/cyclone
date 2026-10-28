/**
 * Decionis sorted JSON v1: recursively sort object keys (UTF-16 code-unit
 * order, i.e. Array.prototype.sort), leave arrays and scalars in place, then
 * JSON.stringify. Byte-identical to `stableJsonStringify` in @decionis/verify
 * (asserted by tests/parity.test.ts).
 */
export class Canon {
  static normalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => Canon.normalize(item));
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) out[key] = Canon.normalize(record[key]);
    return out;
  }

  static stringify(value: unknown): string {
    return JSON.stringify(Canon.normalize(value));
  }

  static isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  static utf8(text: string): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(text);
  }

  static hex(bytes: ArrayBuffer | Uint8Array): string {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let out = '';
    for (const b of view) out += b.toString(16).padStart(2, '0');
    return out;
  }

  static fromHex(hex: string): Uint8Array {
    const clean = hex.replace(/^sha256:/, '');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  static async sha256(text: string): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', Canon.utf8(text));
    return Canon.hex(digest);
  }
}
