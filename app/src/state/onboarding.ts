import type { Store } from './store';

export type FirstShiftState = { version: 1; completed: boolean; finished: string[] };
/** Completion is independent of visits. Resume re-proposes the unfinished beat with a fresh binding. */
export class FirstShift {
  private state: FirstShiftState;
  constructor(private readonly store: Store) {
    const saved = store.read<FirstShiftState | null>('onboarding', null);
    this.state = saved?.version === 1 && Array.isArray(saved.finished)
      ? { version: 1, completed: saved.completed === true, finished: saved.finished.filter(x => typeof x === 'string') }
      : { version: 1, completed: false, finished: [] };
  }
  get completed(): boolean { return this.state.completed; }
  get finished(): readonly string[] { return this.state.finished; }
  save(finished: readonly string[], complete = false): void {
    this.state = { version: 1, completed: complete, finished: [...new Set(finished)] };
    this.store.write('onboarding', this.state);
  }
  reset(): void { this.state = { version: 1, completed: false, finished: [] }; this.store.remove('onboarding'); }
}
