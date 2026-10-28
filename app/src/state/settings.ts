import { Bus } from '../core/bus';
import type { Store } from './store';

export type SettingsState = {
  eyesOnly: boolean;
  oneHanded: boolean;
  highContrast: boolean;
  captions: boolean;
  mode: 'demo' | 'live';
  /** Demo gate flag exercising both C12 paths (amended approval vs counter-offer). */
  amendedApproval: boolean;
  passthrough: boolean;
};

const DEFAULTS: SettingsState = {
  eyesOnly: false,
  oneHanded: false,
  highContrast: false,
  captions: true,
  mode: 'demo',
  amendedApproval: true,
  passthrough: true,
};

/** Hands-first settings (C31), persisted; `changes` notifies systems. */
export class Settings {
  readonly changes = new Bus<{ change: { key: keyof SettingsState; value: unknown } }>();
  private state: SettingsState;

  constructor(private readonly store: Store, overrides: Partial<SettingsState> = {}) {
    this.state = { ...DEFAULTS, ...store.read<Partial<SettingsState>>('settings', {}), ...overrides };
  }

  get<K extends keyof SettingsState>(key: K): SettingsState[K] {
    return this.state[key];
  }

  set<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void {
    if (this.state[key] === value) return;
    this.state[key] = value;
    this.store.write('settings', this.state);
    this.changes.emit('change', { key, value });
  }

  toggle(key: 'eyesOnly' | 'oneHanded' | 'highContrast' | 'captions' | 'amendedApproval' | 'passthrough'): boolean {
    this.set(key, !this.state[key]);
    return this.state[key];
  }

  snapshot(): Readonly<SettingsState> {
    return { ...this.state };
  }

  reset(): void {
    this.state = { ...DEFAULTS };
    this.store.remove('settings');
    for (const key of Object.keys(DEFAULTS) as Array<keyof SettingsState>) {
      this.changes.emit('change', { key, value: this.state[key] });
    }
  }
}
