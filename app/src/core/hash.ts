import type { HeldIntent, IntentBinding } from '../contracts/intent';
import { Canon } from './canon';

/**
 * Browser port of `intentHash()` from @decionis/verify (Agent-Safe Intent v1,
 * `agent-safe.intent/1`). Same bounds, same error codes, same bytes; SHA-256
 * comes from WebCrypto instead of node:crypto.
 */
export class IntentHasher {
  static readonly PROTOCOL = 'agent-safe.intent/1';
  static readonly MAX_DEPTH = 20;
  static readonly MAX_ENTRIES = 5000;
  static readonly MAX_ARRAY_LENGTH = 1000;
  static readonly MAX_BYTES = 100 * 1024;
  private static readonly FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

  static async hash(binding: unknown): Promise<{ canonical_json: string; intent_hash: string }> {
    if (!Canon.isPlainObject(binding)) throw new Error('INVALID_JSON_OBJECT');
    IntentHasher.assertBounded(binding);
    const canonical = Canon.stringify(binding);
    if (Canon.utf8(canonical).byteLength > IntentHasher.MAX_BYTES) throw new Error('INTENT_TOO_LARGE');
    return { canonical_json: canonical, intent_hash: `sha256:${await Canon.sha256(canonical)}` };
  }

  /** Iterative walk mirroring the reference `assertBounded` (same visit order and limits). */
  static assertBounded(root: unknown): void {
    const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
    let entries = 0;
    while (pending.length > 0) {
      const { value, depth } = pending.pop()!;
      if (value === null || typeof value !== 'object') {
        if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('INVALID_NUMBER');
        continue;
      }
      if (depth > IntentHasher.MAX_DEPTH) throw new Error('INTENT_TOO_DEEP');
      if (Array.isArray(value)) {
        if (value.length > IntentHasher.MAX_ARRAY_LENGTH) throw new Error('INTENT_ARRAY_TOO_LARGE');
        for (const item of value) {
          entries += 1;
          if (entries > IntentHasher.MAX_ENTRIES) throw new Error('INTENT_TOO_COMPLEX');
          pending.push({ value: item, depth: depth + 1 });
        }
        continue;
      }
      if (!Canon.isPlainObject(value)) throw new Error('INVALID_JSON_OBJECT');
      for (const key of Object.keys(value)) {
        if (IntentHasher.FORBIDDEN.has(key)) throw new Error('UNSAFE_INTENT_KEY');
        entries += 1;
        if (entries > IntentHasher.MAX_ENTRIES) throw new Error('INTENT_TOO_COMPLEX');
        pending.push({ value: value[key], depth: depth + 1 });
      }
    }
  }

  /** The binding with `action.parameters` replaced — an amended call is a distinct mutation. */
  static amend(binding: IntentBinding, args: Record<string, unknown>): IntentBinding {
    return { ...binding, action: { ...binding.action, parameters: { ...args } } };
  }

  /** Recompute and compare the hash the client is about to sign (C13). */
  static async matches(intent: HeldIntent): Promise<boolean> {
    if (!intent.binding) return false;
    const { intent_hash } = await IntentHasher.hash(intent.binding);
    return intent_hash === intent.intent_hash;
  }
}
