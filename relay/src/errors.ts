import type { GateErrorCode } from '../../app/src/adapters/gate';

/** Client-facing codes: the browser's GateErrorCode set plus two relay-only ones. */
export type RelayCode = GateErrorCode | 'BAD_REQUEST' | 'NOT_HELD';

/**
 * A refusal the relay sends to a client or the agent as `{ code, detail }`
 * (the shape app/src/adapters/live.ts maps). The intent stays held.
 */
export class RelayError extends Error {
  constructor(
    readonly status: number,
    readonly code: RelayCode,
    readonly detail = '',
  ) {
    super(`${code}${detail ? `: ${detail}` : ''}`);
  }

  body(): { code: RelayCode; detail: string } {
    return { code: this.code, detail: Brand.scrub(this.detail) };
  }

  static badRequest(detail: string): RelayError {
    return new RelayError(400, 'BAD_REQUEST', detail);
  }
}

/** The headset never renders a brand name (AGENTS §2): the in-app term is "policy gate". */
export class Brand {
  static scrub(text: string): string {
    return text.replace(/decionis|agent[\s_-]?safe/gi, 'policy gate');
  }
}

/** Narrowing helpers for untrusted JSON. */
export class Json {
  static isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  static str(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  static strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  }
}
