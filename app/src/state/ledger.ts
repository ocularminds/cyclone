import type { SignedRecord } from '../contracts/intent';
import type { Store } from './store';

/**
 * The ledger shelf's records (C10, C11, C19). Persisted across sessions;
 * fixture seals (C49, real recorded dossiers) are kept separately and are
 * never written to storage or cleared by reset.
 */
export class Ledger {
  private records: SignedRecord[];
  private fixtures: SignedRecord[] = [];

  constructor(private readonly store: Store) {
    this.records = store.read<SignedRecord[]>('ledger', []);
  }

  add(record: SignedRecord): void {
    if (this.records.some((r) => r.record_id === record.record_id)) return;
    this.records.push(record);
    this.store.write('ledger', this.records);
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
