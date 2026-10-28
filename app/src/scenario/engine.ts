import type { HeldIntent } from '../contracts/intent';
import type { Beat, Cast, IntentTemplate, ScenarioFile } from '../contracts/scenario';
import type { Clock } from '../core/clock';
import type { Rng } from '../core/rng';
import { IntentFactory } from './factory';

export type EngineOptions = {
  /** Templates the engine may inject as drills (C16). */
  drills?: IntentTemplate[];
  /** Probability of injecting one random drill into the run (0 in capture mode). */
  drillChance?: number;
};

type Spawned = { key: string; intent: HeldIntent };

/**
 * Deterministic scenario engine (C34): replays held-intent payloads on the
 * session clock. Beats fire at a session second, or a delay after an earlier
 * template is finally decided (a counter-offer keeps its chain open until the
 * agent's re-proposal is decided).
 */
export class ScenarioEngine {
  private readonly factory: IntentFactory;
  private readonly templates = new Map<string, IntentTemplate>();
  private beats: Beat[] = [];
  private readonly spawned = new Set<string>();
  private readonly decidedAt = new Map<string, number>();
  private readonly keyOf = new Map<string, string>();
  /** intent key → the original key whose chain it continues (counter-offers). */
  private readonly chainOf = new Map<string, string>();
  private readonly pending: Array<{ at: number; key: string; supersedes?: string }> = [];
  private listener: ((s: Spawned) => void) | null = null;
  private building = 0;

  constructor(
    readonly cast: Cast,
    readonly scenario: ScenarioFile,
    private readonly clock: Clock,
    private readonly rng: Rng,
    private readonly options: EngineOptions = {},
  ) {
    this.factory = new IntentFactory(cast, clock, rng);
    for (const t of scenario.templates) this.templates.set(t.key, t);
    for (const t of options.drills ?? []) this.templates.set(t.key, t);
    this.beats = scenario.beats.map((b) => ({ ...b }));
    this.injectDrill();
  }

  onSpawn(cb: (s: Spawned) => void): void {
    this.listener = cb;
  }

  get beatList(): readonly Beat[] {
    return this.beats;
  }

  template(key: string): IntentTemplate | undefined {
    return this.templates.get(key);
  }

  templateFor(intentId: string): IntentTemplate | undefined {
    const key = this.keyOf.get(intentId);
    return key ? this.templates.get(key) : undefined;
  }

  /** True once every beat has spawned and been finally decided. */
  get finished(): boolean {
    return (
      this.building === 0 &&
      this.pending.length === 0 &&
      this.beats.every((b) => this.decidedAt.has(b.template))
    );
  }

  private injectDrill(): void {
    const pool = this.options.drills ?? [];
    const chance = this.options.drillChance ?? 0;
    if (pool.length === 0 || this.beats.length === 0 || this.rng.next() >= chance) return;
    const drill = this.rng.pick(pool);
    const anchor = this.rng.pick(this.beats);
    this.beats.push({ beat: 'drill_injected', template: drill.key, after: anchor.template, delay_s: 3 });
  }

  /** Call every frame (clock already ticked). Spawns due beats. */
  tick(): void {
    const now = this.clock.seconds;
    for (const beat of this.beats) {
      if (this.spawned.has(beat.template)) continue;
      let due = false;
      if (beat.at !== undefined) due = now >= beat.at;
      else if (beat.after !== undefined) {
        const decided = this.decidedAt.get(beat.after);
        due = decided !== undefined && now >= decided + (beat.delay_s ?? 0);
      }
      if (due) this.spawn(beat.template);
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (now < p.at) continue;
      this.pending.splice(i, 1);
      this.spawn(p.key, p.supersedes);
    }
  }

  private spawn(key: string, supersedes?: string): void {
    const t = this.templates.get(key);
    if (!t) throw new Error(`UNKNOWN_TEMPLATE:${key}`);
    this.spawned.add(key);
    this.building += 1;
    void this.factory.build(t, supersedes).then((intent) => {
      this.building -= 1;
      this.keyOf.set(intent.intent_id, key);
      this.listener?.({ key, intent });
    });
  }

  /**
   * Report a final decision for an intent. A counter-offer (REJECT with a
   * suggestion) schedules the agent's re-proposal instead of closing the chain.
   */
  decided(intentId: string, suggested?: Record<string, unknown>): void {
    const key = this.keyOf.get(intentId);
    if (!key) return;
    const origin = this.chainOf.get(key) ?? key;
    if (suggested) {
      const next = this.nextFor(origin, key, suggested);
      this.chainOf.set(next, origin);
      this.pending.push({ at: this.clock.seconds + 2.5, key: next, supersedes: intentId });
      return;
    }
    this.decidedAt.set(origin, this.clock.seconds);
    if (origin !== key) this.decidedAt.set(key, this.clock.seconds);
  }

  /** Scripted re-proposal when the scenario has one, else a generated one with the suggested args. */
  private nextFor(origin: string, key: string, suggested: Record<string, unknown>): string {
    const scripted = this.scenario.counter_offers?.[origin];
    if (scripted && !this.spawned.has(scripted)) return scripted;
    const base = this.templates.get(key)!;
    const generated: IntentTemplate = {
      ...base,
      key: `${key}+re`,
      args: { ...base.args, ...suggested },
      summary: 'Re-proposal within your suggested limit.',
      is_drill: false,
    };
    this.templates.set(generated.key, generated);
    return generated.key;
  }
}
