/**
 * Pausable session clock. Demo-mode TTLs and scenario schedules run on this
 * clock so hiding the session freezes them (C29, logged in DECISIONS.md);
 * live mode uses wall-clock `expires_at` from the server.
 */
export class Clock {
  private elapsed = 0;
  private paused = false;
  private readonly epoch: number;

  constructor(epoch = Date.now()) {
    this.epoch = epoch;
  }

  /** Advance by a frame delta in seconds. Ignored while paused. */
  tick(delta: number): void {
    if (!this.paused) this.elapsed += Math.min(delta, 0.25) * 1000;
  }

  /** Advance by an exact span (tests, capture mode); ignored while paused. */
  advance(seconds: number): void {
    if (!this.paused) this.elapsed += seconds * 1000;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Session time in ms since start. */
  get ms(): number {
    return this.elapsed;
  }

  get seconds(): number {
    return this.elapsed / 1000;
  }

  /** Session time projected onto the wall clock (stable ISO timestamps). */
  iso(offsetMs = 0): string {
    return new Date(this.epoch + this.elapsed + offsetMs).toISOString();
  }

  /** Session ms for an ISO instant produced by `iso()`. */
  toMs(iso: string): number {
    return Date.parse(iso) - this.epoch;
  }
}
