import type { Decision, HeldIntent, SignedRecord } from '../contracts/intent';

export type GateCapabilities = { supportsAmendedApproval: boolean; source: 'demo' | 'live' };

export type GateErrorCode =
  | 'HASH_MISMATCH'
  | 'EXPIRED'
  | 'FORBIDDEN'
  | 'AMEND_DENIED'
  | 'AMEND_UNSUPPORTED'
  | 'UNKNOWN_INTENT'
  | 'UNAUTHORIZED'
  | 'UNAVAILABLE';

/** A refusal from the policy gate. The intent stays held (fail closed). */
export class GateError extends Error {
  constructor(
    readonly code: GateErrorCode,
    readonly detail = '',
  ) {
    super(`${code}${detail ? `: ${detail}` : ''}`);
  }
}

export type IntentEvent =
  | { type: 'held'; intent: HeldIntent }
  | { type: 'expired'; intent_id: string }
  | { type: 'resolved'; intent_id: string; record: SignedRecord };

/**
 * The one interface every policy-gate integration goes through (AGENTS §6.1).
 * Demo mode never touches the live implementation.
 */
export interface PolicyGateAdapter {
  readonly capabilities: GateCapabilities;
  connect(): Promise<void>;
  onIntent(cb: (event: IntentEvent) => void): () => void;
  resolve(decision: Decision): Promise<SignedRecord>;
  /** Per-frame hook (demo engine schedule); live adapters ignore it. */
  tick(): void;
  disconnect(): void;
}
