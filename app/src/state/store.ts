/**
 * localStorage wrapper that never throws (C19): private windows, blocked site
 * data or quota errors degrade to an in-memory map so the app keeps running.
 */
export class Store {
  private readonly memory = new Map<string, string>();
  private readonly prefix: string;
  private backing: Storage | null;

  constructor(prefix = 'cyclone.', backing?: Storage | null) {
    this.prefix = prefix;
    this.backing = backing === undefined ? Store.probe() : backing;
  }

  private static probe(): Storage | null {
    try {
      const s = globalThis.localStorage;
      if (!s) return null;
      const k = '__cyclone_probe__';
      s.setItem(k, '1');
      s.removeItem(k);
      return s;
    } catch {
      return null;
    }
  }

  get available(): boolean {
    return this.backing !== null;
  }

  read<T>(key: string, fallback: T): T {
    const raw = this.raw(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  write(key: string, value: unknown): void {
    const text = JSON.stringify(value);
    this.memory.set(key, text);
    try {
      this.backing?.setItem(this.prefix + key, text);
    } catch {
      this.backing = null;
    }
  }

  remove(key: string): void {
    this.memory.delete(key);
    try {
      this.backing?.removeItem(this.prefix + key);
    } catch {
      this.backing = null;
    }
  }

  /** Remove every Cyclone key (the reset control, C19). */
  clear(): void {
    this.memory.clear();
    try {
      const s = this.backing;
      if (!s) return;
      const doomed: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k?.startsWith(this.prefix)) doomed.push(k);
      }
      doomed.forEach((k) => s.removeItem(k));
    } catch {
      this.backing = null;
    }
  }

  private raw(key: string): string | null {
    try {
      const v = this.backing?.getItem(this.prefix + key);
      if (v != null) return v;
    } catch {
      this.backing = null;
    }
    return this.memory.get(key) ?? null;
  }
}
