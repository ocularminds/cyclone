import { createSystem } from '@iwsdk/core';
import type { Cyclone } from '../app';
import type { Beat } from '../contracts/scenario';
import type { Token } from '../flow/shift';
import type { Stage } from '../stage';

/**
 * OnboardingSystem (C14, C15, C47): plays the scripted teaching beats with no
 * text walls — token 1 glows until looked at, then a pinch hint pulses once;
 * token 2's timeline handle wiggles, then its dial; token 3 shows the slot
 * lock; token 4 is the drill — and opens the shift summary at the end. Logs
 * every beat with its session time so the timing targets can be checked:
 * first token ≤ 15 s, first seal (satisfying moment) ≤ 90 s, shift ≈ 5 min.
 */
export class OnboardingSystem extends createSystem({}) {
  private app!: Cyclone;
  private stage!: Stage;
  private readonly beatOf = new Map<string, Beat>();
  private firstSeal = false;
  private ended = false;
  private pendingDial: string | null = null;

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    const shift = this.app.shift;
    this.mark('bloom');
    this.cleanupFuncs.push(
      shift.events.on('arrived', (t) => this.arrived(t)),
      shift.events.on('sealed', ({ token }) => {
        if (!this.firstSeal) {
          this.firstSeal = true;
          this.mark('first_seal', token.id);
        }
      }),
      shift.events.on('amended', (t) => {
        if (this.pendingDial === t.id) this.pendingDial = null;
      }),
      shift.events.on('drill', ({ token, caught }) => this.mark(caught ? 'drill_caught' : 'drill_missed', token.id)),
    );
  }

  private mark(beat: string, intentId?: string): void {
    const t = this.app.clock.ms;
    this.app.log.log({ t, type: 'beat', intent_id: intentId, note: beat });
    console.info(`[cyclone][beat] ${beat} t=${(t / 1000).toFixed(1)}s`);
  }

  private arrived(token: Token): void {
    const key = this.app.engine.templateFor(token.id)?.key;
    const beat = this.app.scenario.beats.find((b) => b.template === key);
    if (beat) this.beatOf.set(token.id, beat);
    this.mark(beat?.beat ?? 'token', token.id);
    for (const hint of beat?.hints ?? []) {
      if (hint === 'glow') this.app.bus.emit('hint', { intentId: token.id, hint });
    }
  }

  update(): void {
    // per-token teaching hints, keyed off what the user has already done
    for (const [id, beat] of this.beatOf) {
      const token = this.app.shift.get(id);
      if (!token || token.status !== 'held') {
        this.beatOf.delete(id);
        continue;
      }
      const hints = beat.hints ?? [];
      const focused = this.stage.focus === id;
      if (hints.includes('pinch') && token.inspected && focused) {
        this.app.bus.emit('hint', { intentId: id, hint: 'pinch' });
        beat.hints = hints.filter((h) => h !== 'pinch');
      }
      if (hints.includes('handle') && focused) {
        this.app.bus.emit('hint', { intentId: id, hint: 'handle' });
        beat.hints = (beat.hints ?? []).filter((h) => h !== 'handle');
        this.pendingDial = id;
      }
      if (hints.includes('dial') && focused && this.stage.scrub > 0.6) {
        this.app.bus.emit('hint', { intentId: id, hint: 'dial' });
        beat.hints = (beat.hints ?? []).filter((h) => h !== 'dial');
      }
      if (hints.includes('lock') && focused) {
        this.app.cue('lock', 'This one breaks a hard limit: the slot is locked. Push it off the desk edge to veto.');
        beat.hints = (beat.hints ?? []).filter((h) => h !== 'lock');
      }
    }
    if (!this.ended && this.app.scenario.ends_with_summary && this.app.engine.finished && this.app.shift.waiting().length === 0) {
      this.ended = true;
      this.mark('summary');
      this.app.bus.emit('summary', { show: true });
    }
  }
}
