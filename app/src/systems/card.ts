import { createSystem, Grabbed, Group, PokeInteractable, RayInteractable, Vector3, type Entity, type UIKitMLAsset } from '@iwsdk/core';
import type { Cyclone } from '../app';
import { TokenTag } from '../components';
import { Palette } from '../models/palette';
import type { Stage } from '../stage';
import { Label } from '../ui/label';
import { Proposal, type ReviewPage } from '../ui/proposal';
import { ControlStyle } from '../ui/control';
import { ReadingLayer } from '../ui/reading-layer';

/** A non-interactive reading surface with separate, named hand/ray controls. */
export class CardSystem extends createSystem({ grabbedTokens: { required: [TokenTag, Grabbed] } }) {
  static readonly WIDTH = 0.28;
  static readonly HEIGHT = 0.245;
  static readonly DISTANCE = 0.565;
  static readonly LIFT_DEG = 2.5;
  private app!: Cyclone;
  private stage!: Stage;
  private label!: Label;
  private caption!: Label;
  private readonly root = new Group();
  private rootEntity!: Entity;
  private controls: UIKitMLAsset | null = null;
  private controlsEntity: Entity | null = null;
  private readonly handPoint = new Vector3();
  private readonly physicalPoint = new Vector3();
  private page: ReviewPage = 'review';
  private candidate: string | null = null;
  private dwell = 0;
  private open = 0;
  private controlsKey = '';
  private textPage = 0;
  private pageCount = 1;
  private readonly tmp = new Vector3();
  private readonly at = new Vector3();
  private readonly target = new Vector3();
  private readonly fwd = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();

  init(): void {
    this.app = this.globals.cyclone as Cyclone; this.stage = this.globals.stage as Stage;
    this.root.name = 'inspection';
    this.rootEntity = this.world.createTransformEntity(this.root, { parent: this.stage.rootEntity! });
    this.label = new Label(CardSystem.WIDTH, 0.16);
    this.label.mesh.name = 'decision-card'; this.label.mesh.position.y = 0.0425;
    this.caption = new Label(CardSystem.WIDTH, 0.036);
    this.caption.mesh.name = 'card-caption'; this.caption.mesh.position.y = -0.0605;
    this.root.add(this.caption.mesh);
    this.root.add(this.label.mesh); this.root.visible = false;
    void this.buildControls();
    this.cleanupFuncs.push(this.queries.grabbedTokens.subscribe('qualify', e => {
      const id = e.getValue(TokenTag, 'intentId') as string;
      if (this.stage.focus === id && this.page === 'review') { this.page = 'rationale'; this.stage.detail = true; }
      this.focus(id);
    }));
  }
  private async buildControls(): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('review-controls');
    this.controls = panel; panel.name = 'card-controls'; panel.position.set(0, -0.105, 0.001);
    const entity = this.world.createTransformEntity(panel, { parent: this.rootEntity });
    this.controlsEntity = entity;
    entity.addComponent(PokeInteractable); entity.addComponent(RayInteractable); this.stage.rayTargets.push(entity); this.stage.alwaysRayTargets.add(entity);
    for (const [index, id] of ['a', 'b', 'c'].entries()) {
      const element = panel.requireElementById(id); element.name = `card-${id}`;
      const click = () => this.act(index);
      element.addEventListener('click', click); this.cleanupFuncs.push(() => element.removeEventListener('click', click));
    }
  }
  private act(index: number): void {
    const token = this.stage.focus ? this.app.shift.get(this.stage.focus) : undefined;
    if (!token || this.stage.settingsOpen || this.app.clock.isPaused || token.status === 'deciding' || token.amending) return;
    const hasActions = this.page === 'adjust' || this.page === 'compare';
    if (this.pageCount > 1 && !hasActions) {
      if (index < 2) this.textPage = Math.max(0, Math.min(this.pageCount - 1, this.textPage + (index === 0 ? -1 : 1)));
      else { this.page = this.page === 'review' ? 'tools' : 'review'; this.textPage = 0; }
      this.stage.detail = this.page === 'rationale';
      this.app.cue('unfold', `Review page ${this.textPage + 1}`); return;
    }
    if (hasActions && index === 2 && this.textPage < this.pageCount - 1) {
      this.textPage++; this.app.cue('unfold', `Review page ${this.textPage + 1}`); return;
    }
    if (!hasActions || index === 2) this.textPage = 0;
    if (this.page === 'review' || this.page === 'tools') {
      if (index === 0) this.page = 'rationale';
      if (index === 1 && token.intent.amend && token.intent.policy.requires !== 'forbidden') this.page = 'adjust';
      if (index === 2) this.page = 'compare';
    } else if (this.page === 'adjust') {
      if (index === 2) this.page = 'review';
      else if (token.intent.amend && token.value !== null) void this.app.shift.amend(token.id, token.value + (index === 0 ? -1 : 1) * token.intent.amend.step);
    } else if (this.page === 'compare') {
      if (index === 2) this.page = 'review'; else this.stage.comparison = index === 0 ? 'original' : 'reviewed';
    } else this.page = index === 0 ? 'review' : index === 1 && token.intent.amend && token.intent.policy.requires !== 'forbidden' ? 'adjust' : index === 2 ? 'compare' : 'rationale';
    this.stage.detail = this.page === 'rationale';
    this.app.cue('unfold', this.page === 'rationale' ? 'Full rationale' : this.page === 'review' ? 'Review summary' : this.page === 'adjust' ? 'Amend the proposal' : 'Compare original and proposed');
  }
  private focus(id: string): void {
    if (this.stage.focus === id || this.stage.settingsOpen) return;
    this.stage.focus = id; this.stage.detail = false; this.stage.scrub = 0; this.stage.comparison = 'reviewed';
    this.stage.holdFeedback = '';
    this.page = 'review'; this.app.shift.inspect(id);
    this.textPage = 0;
    const view = this.stage.views.get(id);
    this.app.cue('unfold', `Inspecting: ${view?.token.intent.agent.label ?? 'proposal'}`, view ? [view.home.x, view.home.y, view.home.z] : undefined);
    this.placeCard();
  }
  private gazePick(delta: number): void {
    if (this.stage.settingsOpen || this.stage.replayOpen || this.page !== 'review') return;
    let best: string | null = null; let bestAngle = this.app.settings.get('eyesOnly') ? 7 : 9;
    for (const [id, view] of this.stage.views) {
      if (!['tray', 'slot', 'rack'].includes(view.place)) continue;
      view.object.getWorldPosition(this.at); this.stage.toDesk(this.at);
      const angle = this.stage.gazeAngle(this.at, this.tmp);
      if (angle < bestAngle) { bestAngle = angle; best = id; }
    }
    if (best && best !== this.stage.focus) {
      this.dwell = best === this.candidate ? this.dwell + delta : 0; this.candidate = best;
      if (this.dwell >= (this.app.settings.get('eyesOnly') ? 0.6 : 0.45)) this.focus(best);
    } else { this.dwell = 0; this.candidate = best; }
  }
  /** Open beside the inspected direction, then stay in the desk frame. */
  private placeCard(): void {
    const view = this.stage.focus ? this.stage.views.get(this.stage.focus) : undefined;
    if (view) { view.object.getWorldPosition(this.fwd); this.stage.toDesk(this.fwd).sub(this.stage.head).normalize(); }
    else this.fwd.copy(this.stage.gaze);
    this.right.crossVectors(this.stage.gaze, this.up.set(0, 1, 0)).normalize();
    this.up.crossVectors(this.right, this.stage.gaze).normalize();
    const depth = this.fwd.dot(this.stage.gaze), rad = Math.PI / 180;
    const yaw = Math.max(-5.5 * rad, Math.min(5.5 * rad, Math.atan2(this.fwd.dot(this.right), depth)));
    const pitch = Math.max(-2.5 * rad, Math.min(2.5 * rad, Math.atan2(this.fwd.dot(this.up), depth) + CardSystem.LIFT_DEG * rad));
    this.fwd.copy(this.stage.gaze).addScaledVector(this.right, Math.tan(yaw)).addScaledVector(this.up, Math.tan(pitch)).normalize();
    this.target.copy(this.stage.head).addScaledVector(this.fwd, CardSystem.DISTANCE);
    this.root.position.copy(this.target);
    this.root.lookAt(this.at.copy(this.stage.head).applyMatrix4(this.stage.root.matrixWorld));
  }
  update(delta: number): void {
    this.protectPhysicalInput();
    // QueueSystem clears focus when a token leaves. Its old detail page must
    // not suppress dwell inspection of the next proposal.
    if (!this.stage.focus) { this.page = 'review'; this.textPage = 0; this.stage.detail = false; }
    this.gazePick(delta);
    const view = this.stage.focus ? this.stage.views.get(this.stage.focus) : undefined;
    if (this.stage.focus && (!view || ['leaving', 'gone'].includes(view.place))) { this.stage.focus = null; this.page = 'review'; this.stage.detail = false; }
    const show = !!this.stage.focus && !!view && !this.stage.settingsOpen && !this.stage.replayOpen;
    const reduced = this.app.settings.get('reducedMotion');
    this.open = reduced ? +show : this.open + ((+show) - this.open) * Math.min(1, delta * 10);
    this.root.visible = this.open > 0.02;
    if (!show || !view) return;
    // Turning the head never drags the card across the scene. Reposition only
    // if a seated translation would put one of its actual corners out of reach.
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      this.at.set(x * CardSystem.WIDTH / 2, y * CardSystem.HEIGHT / 2, 0).applyQuaternion(this.root.quaternion).add(this.root.position);
      if (this.at.distanceTo(this.stage.head) > 0.61) this.placeCard();
    }
    this.root.scale.setScalar(Math.max(0.001, this.open));
    const ui = Palette.ui;
    const style = { background: ui.surface, border: ui.border, padding: 0.008, radius: 0.012 };
    const pages = this.label.paginate(Proposal.lines(this.app, this.stage, view.token, this.page), style, this.page === 'adjust' || this.page === 'compare' ? 3 : 2);
    this.pageCount = pages.length; this.textPage = Math.min(this.textPage, pages.length - 1);
    this.label.draw(pages[this.textPage], style);
    this.caption.caption(this.stage.caption);
    this.root.userData.pagination = { page: this.textPage + 1, total: this.pageCount };
    this.root.userData.page = this.page;
    this.root.userData.bounds = { width: CardSystem.WIDTH, height: CardSystem.HEIGHT, distance: CardSystem.DISTANCE, offset: CardSystem.LIFT_DEG };
    this.refreshControls();
    ReadingLayer.apply(this.root);
  }
  /** A reading surface must never capture a pinch intended for a nearby physical control. */
  private protectPhysicalInput(): void {
    const entity = this.controlsEntity; if (!entity) return;
    let near = false;
    for (const side of ['left', 'right'] as const) {
      if (!this.input.xr.getPrimaryInputSource(side)) continue;
      this.player.gripSpaces[side].getWorldPosition(this.handPoint);
      for (const view of this.stage.views.values()) {
        if (view.token.status !== 'held') continue;
        if (view.object.getWorldPosition(this.physicalPoint).distanceTo(this.handPoint) < 0.13) near = true;
      }
      for (const name of ['handle', 'dial']) {
        const object = this.stage.root.getObjectByName(name);
        if (object?.visible && object.getWorldPosition(this.physicalPoint).distanceTo(this.handPoint) < 0.11) near = true;
      }
    }
    if (near) {
      this.stage.suppressedRayTargets.add(entity);
      if (entity.hasComponent(PokeInteractable)) entity.removeComponent(PokeInteractable);
      if (entity.hasComponent(RayInteractable)) entity.removeComponent(RayInteractable);
    } else {
      this.stage.suppressedRayTargets.delete(entity);
      if (!entity.hasComponent(PokeInteractable)) entity.addComponent(PokeInteractable);
      if (!entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable);
    }
  }
  private refreshControls(): void {
    const panel = this.controls; if (!panel) return;
    const token = this.stage.focus ? this.app.shift.get(this.stage.focus) : undefined; if (!token) return;
    const ui = Palette.ui;
    const key = `${this.page}:${this.textPage}:${this.pageCount}:${token.id}:${token.status}:${token.amending}:${Palette.theme}:${Palette.isHighContrast}:${Palette.textScale}:${this.stage.comparison}`;
    if (key === this.controlsKey) return;
    this.controlsKey = key;
    const more = this.textPage < this.pageCount - 1 ? `More ${this.textPage + 1}/${this.pageCount}` : 'Back';
    const labels = this.pageCount > 1 && this.page !== 'adjust' && this.page !== 'compare' ? ['Previous', `Next ${this.textPage + 1}/${this.pageCount}`, this.page === 'review' ? 'Review tools' : 'Back']
      : this.page === 'review' || this.page === 'tools' ? ['Full rationale', token.intent.amend && token.intent.policy.requires !== 'forbidden' ? 'Amend' : 'Not editable', 'Compare']
      : this.page === 'adjust' ? [`- ${token.intent.amend?.step} ${token.intent.amend?.unit}`, `+ ${token.intent.amend?.step} ${token.intent.amend?.unit}`, more]
      : this.page === 'compare' ? ['Original', 'Proposed', more] : ['Review', token.intent.amend && token.intent.policy.requires !== 'forbidden' ? 'Amend' : 'Not editable', 'Compare'];
    for (const [n, id] of ['a', 'b', 'c'].entries()) {
      const active = this.page === 'compare' && (this.stage.comparison === 'original' ? n === 0 : n === 1);
      panel.requireElementById(id).setProperties(ControlStyle.properties(active));
      panel.requireElementById(id + '-label').setProperties({ text: labels[n], fontSize: Palette.textScale, color: active ? ui['on-control'] : ui.text });
    }
  }
}
