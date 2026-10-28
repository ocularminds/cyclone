import type { Store } from './store';

type CalState = { drills: number; caught: number };

/** Calibration score = drill catch rate across sessions (C16). */
export class Calibration {
  private state: CalState;

  constructor(private readonly store: Store) {
    this.state = store.read<CalState>('calibration', { drills: 0, caught: 0 });
  }

  /** A drill is caught when the user does anything but approve it. */
  record(caught: boolean): void {
    this.state.drills += 1;
    if (caught) this.state.caught += 1;
    this.store.write('calibration', this.state);
  }

  /** 0..1, or null before the first drill. */
  get score(): number | null {
    return this.state.drills === 0 ? null : this.state.caught / this.state.drills;
  }

  get drills(): number {
    return this.state.drills;
  }

  get caught(): number {
    return this.state.caught;
  }

  get label(): string {
    const s = this.score;
    return s === null ? 'No drills yet' : `${Math.round(s * 100)}% caught (${this.caught}/${this.drills})`;
  }

  reset(): void {
    this.state = { drills: 0, caught: 0 };
    this.store.remove('calibration');
  }
}
