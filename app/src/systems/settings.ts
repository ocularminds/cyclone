import {
  createSystem,
  PokeInteractable,
  Pressed,
  RayInteractable,
  type Entity,
  type Object3D,
  type UIKit,
  type UIKitMLAsset,
} from '@iwsdk/core';
import type { Cyclone } from '../app';
import { Station } from '../components';
import { Furniture } from '../models/desk';
import { Layout } from '../models/layout';
import type { SettingsState } from '../state/settings';
import type { Stage } from '../stage';

type Toggle = 'eyesOnly' | 'oneHanded' | 'highContrast' | 'captions' | 'passthrough' | 'amendedApproval';

/**
 * SettingsSystem (C19, C27, C31): a small puck on the desk — poke it or look
 * and pinch — opens a UIKitML panel with eyes-only, one-handed, high
 * contrast, captions, passthrough, the demo amendment path, demo/live and a
 * reset. Every control is reachable hands-first.
 */
export class SettingsSystem extends createSystem({
  puckPressed: { required: [Station, Pressed] },
}) {
  private app!: Cyclone;
  private stage!: Stage;
  private puck!: Entity;
  private panel: UIKitMLAsset | null = null;
  private panelEntity: Entity | null = null;
  private open = false;

  private static readonly TOGGLES: Array<[string, Toggle, string]> = [
    ['eyes', 'eyesOnly', 'Eyes-only'],
    ['onehand', 'oneHanded', 'One-handed'],
    ['contrast', 'highContrast', 'High contrast'],
    ['captions', 'captions', 'Captions'],
    ['passthrough', 'passthrough', 'Passthrough'],
  ];

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    this.puck = this.world.createTransformEntity(Furniture.puck(), { parent: this.stage.rootEntity!, persistent: true });
    this.puck.addComponent(Station, { kind: 'puck' });
    this.puck.addComponent(PokeInteractable);
    this.stage.rayTargets.push(this.puck);
    this.cleanupFuncs.push(
      this.queries.puckPressed.subscribe('qualify', (e) => {
        if (e === this.puck) void this.toggle();
      }),
      this.app.settings.changes.on('change', () => this.refresh()),
    );
  }

  private async toggle(): Promise<void> {
    this.open = !this.open;
    this.app.cue('unfold', this.open ? 'Settings open' : 'Settings closed', [...Layout.PUCK]);
    if (this.open && !this.panel) await this.build();
    if (this.panelEntity?.object3D) this.panelEntity.object3D.visible = this.open;
  }

  private async build(): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('settings-panel');
    this.panel = panel;
    const obj = panel as unknown as Object3D;
    obj.position.set(Layout.PUCK[0] + 0.09, 0.14, Layout.PUCK[2] - 0.06);
    obj.scale.setScalar(1);
    this.panelEntity = this.world.createTransformEntity(obj, { parent: this.stage.rootEntity! });
    this.panelEntity.addComponent(RayInteractable);
    this.panelEntity.addComponent(PokeInteractable);
    obj.lookAt(obj.position.clone().setY(this.stage.head.y).sub(obj.position).add(obj.position).applyMatrix4(this.stage.root.matrixWorld));
    const on = (id: string, fn: () => void) => {
      const el = panel.requireElementById(id);
      el.addEventListener('click', fn);
      this.cleanupFuncs.push(() => el.removeEventListener('click', fn));
    };
    for (const [id, key] of SettingsSystem.TOGGLES) on(id, () => this.app.settings.toggle(key));
    on('amend', () => this.app.settings.toggle('amendedApproval'));
    on('mode', () => this.switchMode());
    on('shift', () => this.reload({ mode: 'onboarding' }));
    on('reset', () => {
      this.app.reset();
      this.reload({ mode: 'onboarding' });
    });
    on('close', () => void this.toggle());
    this.refresh();
  }

  /** Demo ↔ live needs a relay URL and session; live is never the default (C34, C35). */
  private switchMode(): void {
    const q = new URLSearchParams(location.search);
    if (q.get('gate') === 'live') {
      q.delete('gate');
      location.search = q.toString();
      return;
    }
    const relay = q.get('relay') ?? this.app.store.read<string | null>('relay', null);
    const token = q.get('token') ?? this.app.store.read<string | null>('relayToken', null);
    if (!relay || !token) {
      this.text('status', 'Live mode needs ?relay=<url>&token=<session>. Staying in demo.');
      return;
    }
    q.set('gate', 'live');
    q.set('relay', relay);
    q.set('token', token);
    location.search = q.toString();
  }

  private reload(params: Record<string, string>): void {
    const q = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(params)) q.set(k, v);
    location.search = q.toString();
  }

  private text(id: string, value: string): void {
    this.panel?.requireElementById<UIKit.Text>(id).setProperties({ text: value });
  }

  private refresh(): void {
    if (!this.panel) return;
    const s: Readonly<SettingsState> = this.app.settings.snapshot();
    for (const [id, key, label] of SettingsSystem.TOGGLES) this.text(`${id}-label`, `${label}: ${s[key] ? 'on' : 'off'}`);
    this.text('amend-label', `Amend: ${s.amendedApproval ? 'approve' : 'counter-offer'}`);
    const live = this.app.gate.capabilities.source === 'live';
    this.text('mode-label', `Gate: ${live ? 'live' : 'demo'}`);
    this.text('status', live ? 'Live mode via relay. Records verified server-side.' : 'Demo mode. Execution is simulated. Amend path applies on reload.');
  }
}
