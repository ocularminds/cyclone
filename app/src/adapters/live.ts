import type { Decision, HeldIntent, SignedRecord, Rehearsed } from '../contracts/intent';
import { Proof } from '../core/proof';
import type { Store } from '../state/store';
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
  private readonly latest = new Map<string, SignedRecord>();
  private readonly reviews: Record<string, { decision: Decision; reviewed?: Rehearsed }>;

  constructor(
    private readonly relay: string,
    private readonly session: string,
    private readonly store?: Store,
  ) {
    const saved = store?.read<unknown>('liveReviews', {});
    this.reviews = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as typeof this.reviews : {};
  }

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
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'intent.held' && msg.intent) this.emit({ type: 'held', intent: msg.intent });
    else if (msg.type === 'intent.expired') this.emit({ type: 'expired', intent_id: msg.intent_id });
    else if ((msg.type === 'intent.resolved' || msg.type === 'record.sealed') && Proof.readable(msg.record)) {
      const record = this.attach(msg.record), prior = this.latest.get(record.record_id);
      if (prior && Proof.revision(prior) >= Proof.revision(record)) return;
      this.latest.set(record.record_id, record);
      this.emit({ type: 'resolved', intent_id: record.intent_id, record });
    }
  }

  private emit(e: IntentEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  onIntent(cb: (event: IntentEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  tick(): void {}

  async resolve(decision: Decision, reviewed?: Rehearsed): Promise<SignedRecord> {
    // Save the reviewed evidence before dispatch, including if the response is lost.
    this.reviews[decision.intent_id] = { decision, reviewed };
    this.store?.write('liveReviews', this.reviews);
    let res: Response;
    try {
      res = await fetch(this.http(`/intents/${encodeURIComponent(decision.intent_id)}/decision`), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.session}` },
        body: JSON.stringify(decision),
      });
    } catch {
      try { return await this.read(decision.intent_id); }
      catch { throw new GateError('PENDING', 'Decision sent; its result is unknown. Check the record without approving again.'); }
    }
    if (res.ok) {
      try {
        const record = this.attach((await res.json()) as SignedRecord);
        const latest = this.latest.get(record.record_id);
        return latest && Proof.revision(latest) > Proof.revision(record) ? latest : record;
      } catch { throw new GateError('PENDING', 'Decision sent; the response could not be read. Check the same record.'); }
    }
    const body = (await res.json().catch(() => ({}))) as { code?: GateErrorCode; detail?: string };
    if (res.status >= 500 && body.code !== 'AMEND_UNSUPPORTED') {
      try { return await this.read(decision.intent_id); }
      catch { throw new GateError('PENDING', 'Decision result unavailable. Check the record without approving again.'); }
    }
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

  private attach(record: SignedRecord): SignedRecord {
    if (!Proof.readable(record)) throw new GateError('PENDING', 'The returned record could not be read. Check the same decision record.');
    const local = this.reviews[record.intent_id];
    return local?.reviewed && Proof.matches(record, local.decision) ? { ...record, local_rehearsal: local.reviewed } : record;
  }

  private async read(id: string): Promise<SignedRecord> {
    const res = await fetch(this.http('/intents/' + encodeURIComponent(id) + '/record'), { headers: { authorization: 'Bearer ' + this.session } });
    if (!res.ok) throw new GateError('PENDING', 'No record yet; do not repeat approval.');
    return this.attach(await res.json() as SignedRecord);
  }

  async recover(id: string): Promise<SignedRecord> {
    const res = await fetch(this.http('/intents/' + encodeURIComponent(id) + '/verification'), {
      method: 'POST', headers: { authorization: 'Bearer ' + this.session },
    });
    if (!res.ok) throw new GateError('PENDING', 'Record could not be checked. The previous request is unchanged.');
    return this.attach(await res.json() as SignedRecord);
  }

  disconnect(): void {
    this.closed = true;
    this.socket?.close();
    this.listeners.clear();
  }
}
