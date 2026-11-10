import {
  createSystem,
  Grabbed,
  OneHandGrabbable,
  PokeInteractable,
  Pressed,
  RayInteractable,
  type Entity,
  type Object3D,
  Vector3,
  type UIKit,
  type UIKitMLAsset,
} from '@iwsdk/core';
import type { Cyclone } from '../app';
import { Station } from '../components';
import { Furniture } from '../models/desk';
import { Layout } from '../models/layout';
import { Palette } from '../models/palette';
import { ControlStyle } from '../ui/control';
import { Preferences, type PreferencesEffect } from '../state/preferences';
import { ReadingLayer } from '../ui/reading-layer';
import type { Stage } from '../stage';


/**
 * SettingsSystem (C19, C27, C31): a small puck on the desk — poke it, pinch it,
 * or look and pinch — opens a UIKitML panel with Gaze + pinch, one-handed, high
 * contrast, captions, passthrough, the demo amendment path, demo/live and a
 * reset. Every control is reachable hands-first.
 */
export class SettingsSystem extends createSystem({
  puckPressed: { required: [Station, Pressed] },
  puckPinched: { required: [Station, Grabbed] },
}) {
  private app!: Cyclone;
  private stage!: Stage;
  private puck!: Entity;
  private panel: UIKitMLAsset | null = null;
  private panelEntity: Entity | null = null;
  private open = false;
  private loading: Promise<void> | null = null;
  private caption: { text: string; age: number } | null = null;
  private inputAfter = 0;

  private preferences!: Preferences;
  private readonly target = new Vector3();
  private readonly look = new Vector3();

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    this.preferences = new Preferences(this.app.settings, () => ({
      live: this.app.gate.capabilities.source === 'live', liveAvailable: this.liveConfiguration() !== null,
      amended: this.app.gate.capabilities.supportsAmendedApproval,
      input: 'Inspect follows head direction. Pinch selects a hand-ray target.',
      progress: this.app.boot.scenario === 'onboarding' ? `First shift: ${Math.min(4, this.app.firstShift.finished.length)} of 4 reviewed. Close to resume.` : 'Handover. Close settings to resume your task.',
      rule: this.app.trust.accepted()[0]?.label ?? null,
    }));
    this.puck = this.world.createTransformEntity(Furniture.puck(), { parent: this.stage.rootEntity!, persistent: true });
    this.puck.addComponent(Station, { kind: 'puck' });
    this.puck.addComponent(PokeInteractable);
    // a near pinch opens it too; the puck itself never moves
    this.puck.addComponent(OneHandGrabbable, { translate: false, rotate: false });
    this.stage.rayTargets.push(this.puck);
    this.cleanupFuncs.push(
      this.queries.puckPressed.subscribe('qualify', (e) => {
        if (e === this.puck) void this.toggle();
      }),
      this.queries.puckPinched.subscribe('qualify', (e) => {
        if (e === this.puck) void this.toggle();
      }),
      this.app.settings.changes.on('change', () => this.refresh()),
      this.app.bus.on('cue', ({ caption }) => {
        if (this.open && this.app.settings.get('captions') && caption) { this.caption = { text: caption, age: 0 }; this.refresh(); }
      }),
    );
  }

  private async toggle(): Promise<void> {
    // A near pinch can qualify both Pressed and Grabbed in the same gesture.
    // Consume that gesture once, including when ray targeting is enabled.
    if (performance.now() < this.inputAfter) return;
    this.open = !this.open;
    this.inputAfter = performance.now() + 650;
    this.stage.settingsOpen = this.open;
    this.app.cue('unfold', this.open ? 'Settings open' : 'Settings closed', [...Layout.PUCK]);
    if (this.open && !this.panel) await (this.loading ??= this.build());
    if (this.open) { this.preferences.page = 'home'; this.preferences.message = ''; this.place(); this.refresh(); }
    if (this.panelEntity?.object3D) this.panelEntity.object3D.visible = this.open;
  }

  private async build(): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('settings-panel');
    this.panel = panel;
    const obj = panel as unknown as Object3D;
    obj.name = 'settings-panel';
    obj.scale.setScalar(1);
    this.panelEntity = this.world.createTransformEntity(obj, { parent: this.stage.rootEntity! });
    this.panelEntity.addComponent(RayInteractable);
    this.panelEntity.addComponent(PokeInteractable);
    this.place();
    const on = (id: string, fn: () => void) => {
      const el = panel.requireElementById(id);
      const activate = () => { if (this.open && performance.now() >= this.inputAfter && !this.puck.hasComponent(Grabbed)) { this.caption = null; fn(); } };
      el.addEventListener('click', activate);
      this.cleanupFuncs.push(() => el.removeEventListener('click', activate));
    };
    for (const [n, slot] of ['a', 'b', 'c'].entries()) on(`action-${slot}`, () => {
      const action = this.preferences.view().actions[n];
      if (action) this.apply(this.preferences.act(action.id));
    });
    on('back', () => this.apply(this.preferences.act('back')));
    on('close', () => this.apply('close'));
    this.refresh();
  }

  /** Place on open relative to the seated head; never head-lock a menu. */
  private place(): void {
    if (!this.panel) return;
    this.target.copy(this.stage.head).addScaledVector(this.stage.gaze, 0.54);
    this.panel.position.copy(this.target);
    this.panel.lookAt(this.look.copy(this.stage.head).applyMatrix4(this.stage.root.matrixWorld));
  }

  private apply(effect: PreferencesEffect): void {
    if (effect === 'close') { void this.toggle(); return; }
    if (effect === 'reset') { this.app.reset(); this.reload({ mode: 'onboarding' }); return; }
    if (effect === 'restart') { this.app.store.remove('onboarding'); this.reload({ mode: 'onboarding' }); return; }
    if (effect === 'mode') this.switchMode();
    if (effect === 'revoke') {
      const rule = this.app.trust.accepted()[0];
      if (rule) this.app.trust.revoke(rule.id);
      this.preferences.message = 'Rule revoked. Future proposals need review; past decisions remain.';
    }
    this.refresh();
  }

  private liveConfiguration(): { relay: string; token: string } | null {
    const q = new URLSearchParams(location.search);
    const relay = q.get('relay') ?? this.app.store.read<string | null>('relay', null);
    const token = q.get('token') ?? this.app.store.read<string | null>('relayToken', null);
    return relay && token ? { relay, token } : null;
  }

  private switchMode(): void {
    const q = new URLSearchParams(location.search);
    if (this.app.gate.capabilities.source === 'live') q.delete('gate');
    else {
      const config = this.liveConfiguration();
      if (!config) return;
      q.set('gate', 'live'); q.set('relay', config.relay); q.set('token', config.token);
    }
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
    const v = this.preferences.view();
    const ui = Palette.ui;
    this.panel.requireElementById('settings-root').setProperties({ backgroundColor: ui.surface, backgroundOpacity: 1, borderColor: ui.border, borderWidth: 0.08 });
    this.text('title', v.title); this.text('status', this.caption?.text ?? v.note);
    const scale = this.app.settings.get('textScale');
    this.panel.requireElementById('title').setProperties({ fontSize: 1.5 * scale, color: ui.text });
    this.panel.requireElementById('status').setProperties({ fontSize: 0.9 * scale, color: ui.muted });
    for (const [n, slot] of ['a', 'b', 'c'].entries()) {
      const action = v.actions[n];
      const el = this.panel.requireElementById(`action-${slot}`);
      el.name = `settings-${action?.id ?? slot}`;
      el.setProperties({ display: action ? 'flex' : 'none', minWidth: 0, minHeight: 3.5, width: 25.6, height: 3.5 });
      el.setProperties({ ...ControlStyle.properties(action?.selected), ...(action?.danger ? { borderColor: ui.danger } : {}) });
      this.text(`label-${slot}`, action ? `${action.selected ? '> ' : ''}${action.label}` : '');
      this.panel.requireElementById(`label-${slot}`).setProperties({ fontSize: scale, color: action?.selected ? ui['on-control'] : action?.danger ? ui.danger : action?.unavailable ? ui.muted : ui.text });
    }
    for (const id of ['back', 'close']) {
      this.panel.requireElementById(id).setProperties(ControlStyle.properties());
      this.panel.requireElementById(id + '-label').setProperties({ fontSize: scale, color: ui.text });
    }
    this.panel.userData.page = this.preferences.page;
    this.panel.userData.actions = v.actions.map(a => ({ ...a }));
  }

  update(delta: number): void {
    if (this.caption && (this.caption.age += delta) > 4) { this.caption = null; this.refresh(); }
    if (this.open && this.panel) ReadingLayer.apply(this.panel);
  }
}
