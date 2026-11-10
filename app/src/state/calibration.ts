import type { Store } from './store';

export type DrillOutcome = 'caught' | 'missed' | 'timeout' | 'escalated' | 'corrected';
type CalState = { version: 2; drills: number; caught: number; timeouts: number; escalated: number; corrected: number; falseAlarms: number };
const empty = (): CalState => ({ version: 2, drills: 0, caught: 0, timeouts: 0, escalated: 0, corrected: 0, falseAlarms: 0 });

/** Assessed catch rate: timeouts miss; unresolved escalation has no assessed denominator. */
export class Calibration {
  private state: CalState;
  readonly legacy: boolean;
  constructor(private readonly store: Store) {
    const saved = store.read<CalState | null>('calibration', null);
    this.legacy = !!saved && saved.version !== 2;
    if (this.legacy) store.write('calibrationLegacy', saved);
    const valid = saved?.version === 2 && Object.keys(empty()).filter(k => k !== 'version').every(k =>
      Number.isSafeInteger(saved[k as keyof CalState]) && saved[k as keyof CalState] >= 0) &&
      saved.caught <= saved.drills && saved.corrected <= saved.caught && saved.timeouts <= saved.drills - saved.caught;
    if (saved?.version === 2 && !valid) store.write('calibrationCorrupt', saved);
    this.state = valid ? { ...saved } : empty();
  }
  record(outcome: DrillOutcome | boolean): void {
    const result = typeof outcome === 'boolean' ? outcome ? 'caught' : 'missed' : outcome;
    if (result === 'escalated') this.state.escalated++;
    else {
      this.state.drills++;
      if (result === 'caught' || result === 'corrected') this.state.caught++;
      if (result === 'corrected') this.state.corrected++;
      if (result === 'timeout') this.state.timeouts++;
    }
    this.store.write('calibration', this.state);
  }
  falseAlarm(): void { this.state.falseAlarms++; this.store.write('calibration', this.state); }
  get score(): number | null { return this.state.drills === 0 ? null : this.state.caught / this.state.drills; }
  get drills(): number { return this.state.drills; }
  get caught(): number { return this.state.caught; }
  get stats(): Readonly<CalState> { return { ...this.state }; }
  get label(): string {
    return this.score === null ? 'No assessed drills' : `${Math.round(this.score * 100)}% caught (${this.caught}/${this.drills})`;
  }
  reset(): void { this.state = empty(); this.store.remove('calibration'); }
}
