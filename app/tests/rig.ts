import { DemoAdapter } from '../src/adapters/demo';
import type { Cast, ScenarioFile } from '../src/contracts/scenario';
import { Clock } from '../src/core/clock';
import { Rng } from '../src/core/rng';
import { DemoSigner } from '../src/core/signer';
import { Shift, type Token } from '../src/flow/shift';
import { ScenarioEngine } from '../src/scenario/engine';
import { Rehearsal, type TwinLayout } from '../src/sim/rehearsal';
import { Calibration } from '../src/state/calibration';
import { Ledger } from '../src/state/ledger';
import { SessionLog } from '../src/state/session';
import { Settings } from '../src/state/settings';
import { Store } from '../src/state/store';
import { TrustBook } from '../src/state/trust';
import cast from '../src/scenario/agents.json';
import twin from '../src/scenario/twin.json';

/** A complete demo-mode desk without any rendering, for unit/e2e logic tests. */
export class Rig {
  readonly clock = new Clock(Date.UTC(2026, 10, 2, 6, 0, 0));
  readonly rng: Rng;
  readonly store: Store;
  readonly settings: Settings;
  readonly ledger: Ledger;
  readonly trust: TrustBook;
  readonly calibration: Calibration;
  readonly log = new SessionLog();
  readonly signer: DemoSigner;
  readonly engine: ScenarioEngine;
  readonly gate: DemoAdapter;
  readonly shift: Shift;
  readonly rehearsal = new Rehearsal(twin as unknown as TwinLayout);

  constructor(scenario: ScenarioFile, opts: { amend?: boolean; seed?: number; store?: Store; drills?: ScenarioFile; drillChance?: number } = {}) {
    this.rng = new Rng(opts.seed ?? 42);
    this.store = opts.store ?? new Store('t.', null);
    this.settings = new Settings(this.store);
    this.ledger = new Ledger(this.store);
    this.trust = new TrustBook(this.store, (cast as Cast).rules);
    this.calibration = new Calibration(this.store);
    this.signer = new DemoSigner(this.store);
    this.engine = new ScenarioEngine(cast as Cast, scenario, this.clock, this.rng, {
      drills: opts.drills?.templates,
      drillChance: opts.drillChance ?? 0,
    });
    this.gate = new DemoAdapter(this.engine, this.signer, this.clock, this.rng, opts.amend ?? true);
    this.shift = new Shift(
      this.gate,
      this.rehearsal,
      this.clock,
      this.settings,
      this.ledger,
      this.trust,
      this.calibration,
      this.log,
      (i) => this.gate.deadline(i.intent_id) ?? Number.POSITIVE_INFINITY,
    );
  }

  async start(): Promise<void> {
    await this.gate.connect();
  }

  /** Advance the session clock in small frames, flushing async work. */
  async advance(seconds: number, frame = 0.1): Promise<void> {
    for (let t = 0; t < seconds; t += frame) {
      this.clock.advance(frame);
      this.gate.tick();
      this.shift.tick();
      await Rig.flush();
    }
  }

  static async flush(): Promise<void> {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  }

  /** Wait until a held token for the given tool appears. */
  async next(tool: string, maxSeconds = 30): Promise<Token> {
    for (let t = 0; t < maxSeconds; t += 0.5) {
      const tok = this.shift.waiting().find((k) => k.intent.tool === tool && k.status === 'held');
      if (tok) return tok;
      await this.advance(0.5);
    }
    throw new Error(`no token for ${tool}`);
  }
}
