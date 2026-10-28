import type { Decision, HeldIntent, SignedRecord } from '../contracts/intent';
import {
  GateError,
  type GateCapabilities,
  type GateErrorCode,
  type IntentEvent,
  type PolicyGateAdapter,
} from './gate';

type RelayMessage =
  | { type: 'intent.held'; intent: HeldIntent }
  | { type: 'intent.expired'; intent_id: string }
  | { type: 'intent.resolved'; intent_id: string; record: SignedRecord }
  | { type: 'record.sealed'; intent_id: string; record: SignedRecord };

/**
 * Live policy gate: talks only to the Cyclone relay (relay/), which holds the
 * policy-gate credentials and runs dossier verification server-side. The
 * client never sees a policy-gate key; it authenticates with a relay session.
 */
export class LiveAdapter implements PolicyGateAdapter {
  /** Amended approval is undocumented upstream (DECISIONS D20a): off until the relay says otherwise. */
  capabilities: GateCapabilities = { supportsAmendedApproval: false, source: 'live' };
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<(e: IntentEvent) => void>();
  private retry = 0;
  private closed = false;

  constructor(
    private readonly relay: string,
    private readonly session: string,
  ) {}

  private http(path: string): string {
    return this.relay.replace(/^ws/, 'http').replace(/\/$/, '') + path;
  }

  async connect(): Promise<void> {
    try {
      const res = await fetch(this.http('/capabilities'), {
        headers: { authorization: `Bearer ${this.session}` },
      });
      if (res.ok) {
        const caps = (await res.json()) as Partial<GateCapabilities>;
        this.capabilities = {
          supportsAmendedApproval: caps.supportsAmendedApproval === true,
          source: 'live',
        };
      }
    } catch {
      // Relay unreachable: stay connected-less; held intents simply never arrive (fail closed).
    }
    this.open();
  }

  private open(): void {
    if (this.closed) return;
    const url = this.relay.replace(/^http/, 'ws').replace(/\/$/, '') + `/ws?session=${encodeURIComponent(this.session)}`;
    const ws = new WebSocket(url);
    this.socket = ws;
    ws.onopen = () => (this.retry = 0);
    ws.onmessage = (ev) => this.onMessage(String(ev.data));
    ws.onclose = () => {
      if (this.closed) return;
      const wait = Math.min(15000, 500 * 2 ** this.retry++);
      setTimeout(() => this.open(), wait);
    };
  }

  private onMessage(raw: string): void {
    let msg: RelayMessage;
    try {
      msg = JSON.parse(raw) as RelayMessage;
    } catch {
      return;
    }
    if (msg.type === 'intent.held') this.emit({ type: 'held', intent: msg.intent });
    else if (msg.type === 'intent.expired') this.emit({ type: 'expired', intent_id: msg.intent_id });
    else this.emit({ type: 'resolved', intent_id: msg.intent_id, record: msg.record });
  }

  private emit(e: IntentEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  onIntent(cb: (event: IntentEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  tick(): void {}

  async resolve(decision: Decision): Promise<SignedRecord> {
    let res: Response;
    try {
      res = await fetch(this.http(`/intents/${encodeURIComponent(decision.intent_id)}/decision`), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.session}` },
        body: JSON.stringify(decision),
      });
    } catch {
      throw new GateError('UNAVAILABLE');
    }
    if (res.ok) return (await res.json()) as SignedRecord;
    const body = (await res.json().catch(() => ({}))) as { code?: GateErrorCode; detail?: string };
    const byStatus: Record<number, GateErrorCode> = {
      401: 'UNAUTHORIZED',
      403: 'UNAUTHORIZED',
      404: 'UNKNOWN_INTENT',
      409: 'HASH_MISMATCH',
      410: 'EXPIRED',
      422: 'AMEND_DENIED',
    };
    throw new GateError(body.code ?? byStatus[res.status] ?? 'UNAVAILABLE', body.detail ?? '');
  }

  disconnect(): void {
    this.closed = true;
    this.socket?.close();
    this.listeners.clear();
  }
}
