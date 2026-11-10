import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HeldIntent, IntentBinding, SignedRecord } from '../../app/src/contracts/intent';
import type { GrantStatus } from './upstream';

/** What the relay did upstream for a record (relay-side note; never rendered). */
export type UpstreamNote = {
  path: 'grant' | 'escalation_cancelled' | 'cancel_failed' | 'lapse' | 'not_documented' | 'local' | 'expired' | 'uncertain';
  detail?: string;
  decision_id?: string;
  status?: string;
};

export type LiveRecord = SignedRecord & { relay?: UpstreamNote };

/** The policy gate's hold, as the agent's grant response and/or the webhook state it. */
export type Hold = {
  status: GrantStatus;
  decision_id?: string;
  dossier_id?: string;
  escalation_id?: string | null;
  reason_codes?: string[];
};

export type Presentation = {
  summary?: string;
  rationale?: string;
  drill?: boolean;
  supersedes?: string;
  agent_label?: string;
};

export type HookInfo = {
  intent_hash: string;
  expires_at?: string;
  decision_id?: string;
  dossier_id?: string;
  escalation_id?: string | null;
  reason_codes?: string[];
  outcome?: string;
  received_at: string;
};

export type EntryState = 'pending' | 'held' | 'deciding' | 'resolved' | 'expired' | 'withdrawn' | 'uncertain';

export type Entry = {
  intent_id: string;
  state: EntryState;
  binding?: IntentBinding;
  intent_hash?: string;
  hold?: Hold;
  hook?: HookInfo;
  presentation?: Presentation;
  /** Built once the binding is known and its hash checks out. */
  intent?: HeldIntent;
  /** ESCALATE keeps the intent held; its record is kept apart from the final one. */
  escalation?: LiveRecord;
  final?: LiveRecord;
  note?: string;
};

/**
 * Held intents and sealed records. In memory, optionally mirrored to
 * `<dataDir>/state.json` (atomic rename) so a relay restart keeps what is held
 * and every record already returned (idempotency survives restarts).
 */
export class Store {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly dir: string | null) {
    this.load();
  }

  get(intentId: string): Entry | undefined {
    return this.entries.get(intentId);
  }

  ensure(intentId: string): Entry {
    let e = this.entries.get(intentId);
    if (!e) this.entries.set(intentId, (e = { intent_id: intentId, state: 'pending' }));
    return e;
  }

  all(): Entry[] {
    return [...this.entries.values()];
  }

  /** Only undecided holds may be presented for a new gesture. */
  held(): Entry[] {
    return this.all().filter((e) => e.state === 'held' && !e.final && e.intent);
  }

  save(): void {
    if (!this.dir) return;
    mkdirSync(this.dir, { recursive: true });
    const file = join(this.dir, 'state.json');
    writeFileSync(`${file}.tmp`, JSON.stringify({ version: 2, entries: this.all() }));
    renameSync(`${file}.tmp`, file);
  }

  private load(): void {
    if (!this.dir) return;
    const file = join(this.dir, 'state.json');
    if (!existsSync(file)) return;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { version: number; entries: Entry[] };
      if (![1, 2].includes(data.version) || !Array.isArray(data.entries)) throw new Error('Unsupported state shape');
      for (const e of data.entries) {
        if (!e || typeof e.intent_id !== 'string' || !['pending', 'held', 'deciding', 'resolved', 'expired', 'withdrawn', 'uncertain'].includes(e.state) || this.entries.has(e.intent_id)) throw new Error('Invalid or duplicate entry');
        // A lost response is not proof that authorization failed. Never resubmit it.
        if (e.state === 'deciding') {
          e.state = e.final?.authorization?.status === 'approved' ? 'resolved' : 'uncertain';
          e.note = 'Interrupted authorization; recover the same record without approving again.';
        }
        this.entries.set(e.intent_id, e);
      }
    } catch {
      // Forgetting a dispatched approval could authorize it twice after restart.
      // Preserve the file and require recovery; never start an empty authority store.
      throw new Error('Relay state is unreadable. Restore or reconcile state.json before accepting decisions.');
    }
  }
}
