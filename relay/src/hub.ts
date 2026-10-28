import type { HeldIntent, SignedRecord } from '../../app/src/contracts/intent';

/** Server → client messages, exactly the union app/src/adapters/live.ts parses (AGENTS §8.1). */
export type RelayMessage =
  | { type: 'intent.held'; intent: HeldIntent }
  | { type: 'intent.expired'; intent_id: string }
  | { type: 'intent.resolved'; intent_id: string; record: SignedRecord }
  | { type: 'record.sealed'; intent_id: string; record: SignedRecord };

export type Peer = { send(data: string): void; readyState: number; close(code?: number, reason?: string): void };

/** WebSocket fan-out. */
export class Hub {
  private readonly peers = new Set<Peer>();
  /** Every message, in order (tests and diagnostics). */
  readonly log: RelayMessage[] = [];

  add(peer: Peer, snapshot: HeldIntent[]): void {
    this.peers.add(peer);
    for (const intent of snapshot) this.sendTo(peer, { type: 'intent.held', intent });
  }

  remove(peer: Peer): void {
    this.peers.delete(peer);
  }

  get size(): number {
    return this.peers.size;
  }

  broadcast(msg: RelayMessage): void {
    this.log.push(msg);
    for (const peer of this.peers) this.sendTo(peer, msg);
  }

  private sendTo(peer: Peer, msg: RelayMessage): void {
    // 1 = OPEN
    if (peer.readyState === 1) peer.send(JSON.stringify(msg));
  }

  closeAll(): void {
    for (const peer of this.peers) peer.close(1001, 'relay shutting down');
    this.peers.clear();
  }
}
