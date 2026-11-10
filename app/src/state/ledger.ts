import type { SignedRecord } from '../contracts/intent';
import type { Store } from './store';
import { Proof } from '../core/proof';

/**
 * The ledger shelf's records (C10, C11, C19). Persisted across sessions;
 * fixture seals (C49, real recorded dossiers) are kept separately and are
 * never written to storage or cleared by reset.
 */
export class Ledger {
  private records: SignedRecord[];
  private fixtures: SignedRecord[] = [];

  constructor(private readonly store: Store) {
    const saved = store.read<unknown>('ledger', []);
    this.records = Array.isArray(saved) ? saved.filter(Proof.readable) : [];
    if (!Array.isArray(saved) || this.records.length !== saved.length) store.write('ledgerCorrupt', saved);
  }

  add(record: SignedRecord): boolean {
    if (!Proof.readable(record)) return false;
    const index = this.records.findIndex(r => r.record_id === record.record_id);
    if (index >= 0) {
      const prior = this.records[index];
      if (record.source !== 'live' || prior.source !== 'live' || !Proof.matches(record, prior.decision) ||
        Proof.revision(record) <= Proof.revision(prior)) return false;
      this.records[index] = { ...record, local_rehearsal: prior.local_rehearsal ?? record.local_rehearsal };
    } else this.records.push(record);
    this.store.write('ledger', this.records);
    return true;
  }

  seed(fixtures: SignedRecord[]): void {
    this.fixtures = fixtures;
  }

  /** Fixtures first (last night's verified seals), then this install's records. */
  all(): readonly SignedRecord[] {
    return [...this.fixtures, ...this.records];
  }

  own(): readonly SignedRecord[] {
    return this.records;
  }

  find(recordId: string): SignedRecord | undefined {
    return this.all().find((r) => r.record_id === recordId);
  }

  clear(): void {
    this.records = [];
    this.store.remove('ledger');
  }
}
