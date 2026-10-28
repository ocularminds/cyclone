import { DemoAdapter } from './adapters/demo';
import type { PolicyGateAdapter } from './adapters/gate';
import { LiveAdapter } from './adapters/live';
import type { SignedRecord } from './contracts/intent';
import type { Cast, ScenarioFile } from './contracts/scenario';
import { Bus } from './core/bus';
import { Clock } from './core/clock';
import { Rng } from './core/rng';
import { DemoSigner } from './core/signer';
import { Shift } from './flow/shift';
import { ScenarioEngine } from './scenario/engine';
import { Rehearsal, type TwinLayout } from './sim/rehearsal';
import { Calibration } from './state/calibration';
import { Ledger } from './state/ledger';
import { SessionLog } from './state/session';
import { Settings } from './state/settings';
import { Store } from './state/store';
import { TrustBook } from './state/trust';
import cast from './scenario/agents.json';
import onboarding from './scenario/onboarding.json';
import handover from './scenario/handover.json';
import drills from './scenario/drills.json';
import twin from './scenario/twin.json';
import fixtures from './scenario/fixtures.json';

export type CueName =
  | 'drop'
  | 'unfold'
  | 'scrub'
  | 'lock'
  | 'hold'
  | 'seal'
  | 'veto'
  | 'drill'
  | 'escalate'
  | 'deny'
  | 'rule'
  | 'expire'
  | 'risk';

export type Vec = [number, number, number];

export type AppEvents = {
  /** A sound cue with its caption, positioned in desk space when given (C24, C28). */
  cue: { name: CueName; caption: string; at?: Vec; level?: number };
  /** Onboarding hint pulses (C14). */
  hint: { intentId: string; hint: 'glow' | 'pinch' | 'handle' | 'dial' | 'lock' | 'hold' | 'push' };
  /** Ghost replay requests (drill reveal, ledger replay). */
  replay: { tool: string; asset_id: string; args: Record<string, unknown>; label: string };
  summary: { show: boolean };
  /** Free text shown briefly on the desk HUD (drill reveal, refusals). */
  toast: { text: string; tone: 'info' | 'warn' | 'good' };
};

export type BootOptions = {
  scenario: 'onboarding' | 'handover';
  capture: 'off' | 'shot' | 'endcard';
  live: { relay: string; token: string } | null;
  amend: boolean;
  seed: number;
};

/**
 * Cyclone's service container. Built once in index.ts and shared with every
 * system through `world.globals.cyclone`.
 */
export class Cyclone {
  readonly bus = new Bus<AppEvents>();
  readonly clock: Clock;
  readonly rng: Rng;
  readonly store: Store;
  readonly settings: Settings;
  readonly ledger: Ledger;
  readonly trust: TrustBook;
  readonly calibration: Calibration;
  readonly log = new SessionLog();
  readonly signer: DemoSigner;
  readonly rehearsal = new Rehearsal(twin as unknown as TwinLayout);
  readonly cast = cast as Cast;
  readonly scenario: ScenarioFile;
  readonly engine: ScenarioEngine;
  readonly gate: PolicyGateAdapter;
  readonly shift: Shift;
  readonly firstVisit: boolean;

  constructor(readonly boot: BootOptions) {
    const capture = boot.capture !== 'off';
    this.clock = new Clock(capture ? Date.UTC(2026, 10, 18, 6, 0, 0) : Date.now());
    this.rng = new Rng(boot.seed);
    // capture runs use their own namespace: the shot run starts clean, the end card reads its seals
    this.store = capture ? new Store('cyclone.capture.') : new Store();
    if (boot.capture === 'shot') this.store.clear();
    this.firstVisit = this.store.read<number>('visits', 0) === 0;
    this.store.write('visits', this.store.read<number>('visits', 0) + 1);
    this.settings = new Settings(this.store, capture ? { captions: true } : {});
    this.ledger = new Ledger(this.store);
    this.ledger.seed((fixtures as { records: SignedRecord[] }).records);
    this.trust = new TrustBook(this.store, this.cast.rules);
    this.calibration = new Calibration(this.store);
    this.signer = new DemoSigner(this.store);
    this.scenario = (
      boot.capture === 'endcard'
        ? { id: 'endcard', title: 'End card', templates: [], beats: [] }
        : boot.scenario === 'onboarding'
          ? onboarding
          : handover
    ) as ScenarioFile;
    this.engine = new ScenarioEngine(this.cast, this.scenario, this.clock, this.rng, {
      drills: (drills as ScenarioFile).templates,
      drillChance: capture || boot.scenario === 'onboarding' ? 0 : 0.5,
    });
    if (boot.live) {
      this.gate = new LiveAdapter(boot.live.relay, boot.live.token);
    } else {
      this.gate = new DemoAdapter(this.engine, this.signer, this.clock, this.rng, boot.amend);
    }
    const demo = this.gate instanceof DemoAdapter ? this.gate : null;
    this.shift = new Shift(
      this.gate,
      this.rehearsal,
      this.clock,
      this.settings,
      this.ledger,
      this.trust,
      this.calibration,
      this.log,
      (intent) => demo?.deadline(intent.intent_id) ?? this.clock.ms + (Date.parse(intent.expires_at) - Date.now()),
    );
  }

  static options(search: string): BootOptions {
    const q = new URLSearchParams(search);
    const cap = q.get('capture');
    const capture = cap === 'endcard' ? 'endcard' : cap === '1' || cap === 'true' ? 'shot' : 'off';
    const relay = q.get('relay');
    const token = q.get('token');
    const visited = (() => {
      try {
        return Number(globalThis.localStorage?.getItem('cyclone.visits') ?? '0') > 0;
      } catch {
        return false;
      }
    })();
    const mode = q.get('mode');
    return {
      scenario:
        mode === 'handover' || mode === 'onboarding'
          ? mode
          : capture !== 'off' || !visited
            ? 'onboarding'
            : 'handover',
      capture,
      live: q.get('gate') === 'live' && relay && token ? { relay, token } : null,
      amend: q.get('amend') !== '0',
      seed: capture !== 'off' ? 1 : Number(q.get('seed') ?? NaN) || undefined!,
    };
  }

  async start(): Promise<void> {
    await this.gate.connect();
  }

  /** Per-frame: advance the session clock, the gate schedule and expiry. */
  tick(delta: number): void {
    this.clock.tick(delta);
    this.gate.tick();
    this.shift.tick();
  }

  cue(name: CueName, caption: string, at?: Vec, level?: number): void {
    this.bus.emit('cue', { name, caption, at, level });
  }

  /** Reset control (C19): wipes persisted ledger, trust, calibration and settings. */
  reset(): void {
    this.ledger.clear();
    this.trust.reset();
    this.calibration.reset();
    this.settings.reset();
    this.store.clear();
  }
}
