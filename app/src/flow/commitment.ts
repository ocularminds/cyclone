export type HoldInput = { delta: number; tracked: boolean; engaged: boolean; permitted: boolean; binding: string };

/** A short tracking dropout freezes time. Release, edit, pause or expiry cancels. */
export class Commitment {
  static readonly SECONDS = 1.5;
  static readonly DROPOUT = 0.15;
  elapsed = 0;
  private missing = 0;
  private binding: string | null = null;

  step(input: HoldInput): 'idle' | 'holding' | 'interrupted' | 'cancelled' | 'complete' {
    const { delta, tracked, engaged, permitted, binding } = input;
    if (!permitted || (this.binding !== null && this.binding !== binding)) return this.cancel();
    if (!tracked) {
      if (this.elapsed === 0) return 'idle';
      this.missing += Math.max(0, delta);
      if (this.missing >= Commitment.DROPOUT) return this.cancel();
      return 'interrupted';
    }
    if (!engaged) return this.cancel();
    this.missing = 0; this.binding = binding;
    this.elapsed = Math.min(Commitment.SECONDS, this.elapsed + Math.max(0, Math.min(delta, 0.1)));
    return this.elapsed >= Commitment.SECONDS - 1e-8 ? 'complete' : 'holding';
  }

  reset(): void { this.elapsed = 0; this.missing = 0; this.binding = null; }
  private cancel(): 'idle' | 'cancelled' {
    const wasActive = this.binding !== null;
    this.reset();
    return wasActive ? 'cancelled' : 'idle';
  }
}
