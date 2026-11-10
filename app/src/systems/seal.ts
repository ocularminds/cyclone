import { createSystem, Grabbed, Group, OneHandGrabbable, PokeInteractable, RayInteractable, Vector3, type Entity, type UIKitMLAsset } from '@iwsdk/core';
import type { Cyclone } from '../app';
import { SealTag } from '../components';
import { isLive, type SignedRecord } from '../contracts/intent';
import { Glyph } from '../core/glyph';
import { Proof } from '../core/proof';
import { Receipt } from '../core/receipt';
import { Layout } from '../models/layout';
import { Palette } from '../models/palette';
import { Tokens, type SealKind } from '../models/token';
import type { Stage } from '../stage';
import { Label, type Line } from '../ui/label';
import { ControlStyle } from '../ui/control';
import { ReadingLayer } from '../ui/reading-layer';
import { PanelReach } from '../ui/reach';

type SealView = { record: SignedRecord; entity: Entity; root: Group; home: Vector3; from: Vector3; t: number; verified: boolean | null; history: 'checking' | 'available' | 'unavailable' };
type Page = 'action' | 'history' | 'proof' | 'menu';

/** Pick up a receipt to inspect its action, retained model evidence and proof separately. */
export class SealSystem extends createSystem({ grabbed: { required: [SealTag, Grabbed] } }) {
  static readonly SHOWN = 15;
  private app!: Cyclone;
  private stage!: Stage;
  private readonly seals: SealView[] = [];
  private detail!: Label;
  private caption!: Label;
  private readonly detailRoot = new Group();
  private detailFor: SealView | null = null;
  private controls: UIKitMLAsset | null = null;
  private page: Page = 'action';
  private readonly v = new Vector3();
  private endcard = false;
  private controlsKey = '';
  private textPage = 0;
  private pageCount = 1;
  private inputAfter = 0;
  private retrying = false;
  private readonly reach = new PanelReach();

  init(): void {
    this.app = this.globals.cyclone as Cyclone; this.stage = this.globals.stage as Stage;
    this.endcard = this.app.boot.capture === 'endcard';
    this.detailRoot.name = 'receipt-detail'; this.detailRoot.visible = false;
    const parent = this.world.createTransformEntity(this.detailRoot, { parent: this.stage.rootEntity! });
    this.detail = new Label(0.28, 0.16);
    this.detail.mesh.name = 'receipt-text'; this.detail.mesh.position.y = 0.0425;
    this.caption = new Label(0.28, 0.036);
    this.caption.mesh.name = 'receipt-caption'; this.caption.mesh.position.y = -0.0605;
    this.detailRoot.add(this.caption.mesh);
    this.detailRoot.add(this.detail.mesh);
    void this.buildControls(parent);
    for (const r of this.app.ledger.all().slice(-SealSystem.SHOWN)) this.add(r, null);
    const onRecord = ({ token, record }: { token: { id: string }; record: SignedRecord }) => {
      const view = this.stage.views.get(token.id);
      this.add(record, view ? view.object.position.clone() : null);
      this.app.cue('seal', `Decision recorded: ${SealSystem.kindOf(record)}. Proof is checked separately.`, [...Layout.LEDGER]);
    };
    this.cleanupFuncs.push(
      this.app.shift.events.on('sealed', onRecord), this.app.shift.events.on('escalated', onRecord), this.app.shift.events.on('auto', onRecord),
      this.app.shift.events.on('record', r => this.add(r, null)),
      this.queries.grabbed.subscribe('qualify', e => this.pickUp(e)),
      this.queries.grabbed.subscribe('disqualify', e => {
        const s = this.seals.find(x => x.entity === e);
        if (s) { s.from.copy(s.root.position); s.t = 0; }
        // Keep the detail open so a one-handed user can release the seal and select a tab.
      }),
    );
  }
  private async buildControls(parent: Entity): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('review-controls');
    this.controls = panel; panel.name = 'receipt-controls'; panel.position.set(0, -0.105, 0.001);
    const e = this.world.createTransformEntity(panel, { parent }); e.addComponent(PokeInteractable); e.addComponent(RayInteractable); this.stage.rayTargets.push(e); this.stage.alwaysRayTargets.add(e);
    for (const [n, id] of ['a', 'b', 'c'].entries()) {
      const element = panel.requireElementById(id); element.name = `receipt-${id}`;
      const click = () => this.act(n); element.addEventListener('click', click);
      this.cleanupFuncs.push(() => element.removeEventListener('click', click));
    }
  }
  private act(n: number): void {
    if (!this.detailFor || this.stage.settingsOpen || performance.now() < this.inputAfter) return;
    if (this.page === 'proof') {
      if (n === 0) void (this.detailFor.record.source === 'live' ? this.retryCheck() : this.exportProof());
      else if (n === 1) this.textPage = (this.textPage + 1) % this.pageCount;
      else { this.page = 'menu'; this.textPage = 0; }
      return;
    }
    if (this.pageCount > 1 && this.page !== 'history') {
      if (n < 2) this.textPage = Math.max(0, Math.min(this.pageCount - 1, this.textPage + (n === 0 ? -1 : 1)));
      else { this.page = 'menu'; this.textPage = 0; }
      return;
    }
    if (this.page === 'history' && n === 2 && this.textPage < this.pageCount - 1) { this.textPage++; return; }
    if (this.page !== 'history' || n === 2) this.textPage = 0;
    if (this.page === 'history') {
      if (n === 2) this.page = 'action'; else this.replay(this.detailFor, n === 0);
    } else if (n === 2) { this.detailFor = null; this.stage.replayOpen = false; }
    else if (this.page === 'action' || this.page === 'menu') { this.page = n === 0 ? 'history' : 'proof'; }
    else this.page = n === 0 ? 'action' : 'history';
    this.app.cue('unfold', this.detailFor ? `Receipt ${this.page}` : 'Receipt closed');
  }
  private async retryCheck(): Promise<void> {
    if (this.retrying || !this.detailFor) return;
    this.retrying = true;
    const id = this.detailFor.record.intent_id;
    this.app.cue('unfold', 'Checking the existing record. No new approval is sent.');
    try {
      const record = await this.app.shift.recoverRecord(id);
      this.app.cue('unfold', record && Proof.official(record) ? 'Record verified for this action.' : 'Record could not be verified. The previous request is unchanged.');
    } finally { this.retrying = false; }
  }
  private async exportProof(): Promise<void> {
    if (!this.detailFor || this.retrying) return;
    this.retrying = true;
    try {
      const record = this.detailFor.record, data = await this.app.signer.export(record);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `cyclone-demo-${record.record_id}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.app.cue('unfold', 'Demo proof exported with its public key. Local signature only.');
    } catch { this.app.cue('unfold', 'No valid demo proof export is available for this receipt.'); }
    finally { this.retrying = false; }
  }
  static kindOf(r: SignedRecord): SealKind {
    switch (r.decision.decision) {
      case 'APPROVE': return 'approve'; case 'APPROVE_AMENDED': return 'amended';
      case 'ESCALATE': return 'escalate'; case 'AUTO_APPROVE_RULE': return 'auto';
      default: return r.decision.reason?.code === 'expired' ? 'expired' : 'reject';
    }
  }
  private add(record: SignedRecord, from: Vector3 | null): void {
    const existing = this.seals.find(s => s.record.record_id === record.record_id);
    if (existing) {
      if (Proof.revision(record) <= Proof.revision(existing.record)) return;
      existing.record = record; this.check(existing); return;
    }
    const glyph = Glyph.from(record.amended_hash ?? record.intent_hash);
    const view: SealView = {
      record, entity: null!, root: Tokens.seal(SealSystem.kindOf(record), glyph, false), home: new Vector3(), from: new Vector3(),
      t: from ? 0 : 1, verified: isLive(record.verification) ? Proof.official(record) : null, history: 'checking',
    };
    view.entity = this.world.createTransformEntity(view.root, { parent: this.stage.rootEntity! });
    view.root.userData.recordId = record.record_id;
    view.entity.addComponent(SealTag, { recordId: record.record_id });
    view.entity.addComponent(OneHandGrabbable, { rotate: true, translate: true });
    this.seals.push(view);
    this.check(view);
    while (this.seals.length > SealSystem.SHOWN) this.seals.shift()!.entity.dispose();
    this.layout(); if (from) view.from.copy(from); else view.root.position.copy(view.home);
  }
  private check(view: SealView): void {
    const record = view.record, glyph = Glyph.from(record.amended_hash ?? record.intent_hash);
    view.verified = isLive(record.verification) && record.verification.proof_status !== 'pending' ? Proof.official(record) : null;
    view.history = 'checking';
    void Promise.all([isLive(record.verification) ? Promise.resolve(Proof.official(record)) : this.app.signer.verify(record), Receipt.check(record)])
      .then(([signature, history]) => {
        if (view.record !== record) return;
        view.verified = isLive(record.verification) && record.verification.proof_status === 'pending' ? null : signature;
        view.history = history && (record.source === 'live' || signature) ? 'available' : 'unavailable';
        Tokens.sealProof(view.root, glyph, signature);
      }).catch(() => { if (view.record === record) { view.verified = false; view.history = 'unavailable'; } });
  }
  private layout(): void {
    this.seals.forEach((s, i) => {
      s.home.set(...Layout.sealSpot(i));
      if (this.endcard) {
        // The four captured decisions form one even row; end-card seals are
        // presentation objects, so the regular grasp spacing is not needed.
        const columns = Math.min(4, this.seals.length), row = Math.floor(i / columns), count = Math.min(columns, this.seals.length - row * columns);
        s.home.set(Layout.LEDGER[0] + (i % columns - (count - 1) / 2) * 0.032, 0.022 + row * Layout.SEAL_RISE, Layout.LEDGER[2] - row * 0.012);
      }
      if (s.t >= 1) { s.from.copy(s.root.position); s.t = 0; }
    });
  }
  private pickUp(e: Entity): void {
    const s = this.seals.find(x => x.entity === e); if (!s || this.endcard) return;
    this.detailFor = s; this.page = 'action'; this.stage.replayOpen = true;
    this.detailRoot.userData.recordId = s.record.record_id;
    this.inputAfter = performance.now() + 650;
    this.textPage = 0;
    this.placeDetail();
    this.replay(s);
  }
  private placeDetail(): void {
    this.detailRoot.position.copy(this.stage.head).addScaledVector(this.stage.gaze, 0.565);
    this.detailRoot.lookAt(this.v.copy(this.stage.head).applyMatrix4(this.stage.root.matrixWorld));
    this.reach.placed(this.stage.head);
  }
  private replay(s: SealView, original = false): void {
    const result = s.history === 'available' ? Receipt.result(s.record, original) : null;
    if (!result) { this.app.cue('unfold', 'Original rehearsal evidence unavailable. The receipt remains readable.'); return; }
    this.app.bus.emit('replay', { tool: result.tool, asset_id: result.asset_id, args: result.args, result, label: `Stored ${original ? 'original' : 'reviewed'} rehearsal` });
    this.app.cue('unfold', 'Replaying the stored model evidence');
  }
  static tier(t: string): string {
    return /provisional|anonymous/i.test(t) ? 'Provisional anonymous workspace' : /owned/i.test(t) ? 'Owned workspace' : 'Unknown issuer';
  }
  private lines(s: SealView): Line[] {
    const r = s.record, ui = Palette.ui, evidence = r.local_rehearsal ?? r.rehearsal;
    const snap = s.history === 'available' ? evidence.snapshot : undefined;
    const line = (text: string, size = 0.009, color = ui.text, weight: 400 | 600 | 700 = 400): Line => ({ text, size, color, weight });
    const header: Line[] = [{ text: 'Decision receipt', size: 0.015, weight: 700, display: true }, line(`${SealSystem.kindOf(r).toUpperCase()} / ${r.source === 'demo' ? 'Demo' : 'Live policy gate'}`, 0.01, ui.accent, 700)];
    if (this.page === 'menu') return [...header, line('Choose the retained rehearsal or the proof details. The action and its execution outcome are separate.'), line('Close to return to the desk.')];
    if (this.page === 'proof') {
      const v = r.verification;
      return [...header,
        line(isLive(v) ? (s.verified === null ? 'Checking decision record' : s.verified ? 'Signature and action binding checked' : 'Record could not be verified') : s.verified === null ? 'Demo signature: checking...' : s.verified ? 'Demo signature: valid' : 'Demo signature: invalid', 0.012, s.verified ? ui.accent : ui.warning, 700),
        ...(r.source === 'live' ? [line(`Authorization: ${r.authorization?.status ?? 'unknown'}. Retry checks this record; it never sends a new approval.`)] : []),
        ...(isLive(v) ? [line(`Issuer: ${SealSystem.tier(v.issuer_tier)}`), line(v.assurance_scope_summary), line(`Coverage: ${v.required_artifact_coverage_verified ? 'checked' : 'not established'}. Binding: ${v.intent_binding_verified === true ? 'checked' : 'not established'}.`)]
          : [line('Signed with this installation\'s local demo key. This is not an official policy-gate attestation.')]),
        line(r.source === 'demo' ? 'Execution is simulated in this demo.' : 'An authorization does not confirm physical execution.'),
        line(snap ? 'The model snapshot has a separate local digest.' : 'Legacy receipt: no retained model snapshot.'),
        line(`Glyph ${Glyph.from(r.amended_hash ?? r.intent_hash).label}`, 0.009, ui.muted),
        line((r.amended_hash ?? r.intent_hash).slice(0, 24) + '...', 0.0075, ui.muted),
      ];
    }
    if (this.page === 'history') return [...header,
      line(s.history === 'available' ? 'Retained rehearsal available' : s.history === 'checking' ? 'Checking retained evidence...' : 'Original evidence unavailable', 0.012, s.history === 'available' ? ui.accent : ui.warning, 700),
      line(snap ? `${snap.model} / ${snap.version}` : 'This older record stores arguments only.'),
      line(s.history === 'available' ? 'Replay uses retained poses, path samples, zones and starting geometry. It does not rerun today\'s model.' : 'The original rehearsal cannot be replayed. We do not reconstruct it and call it historical evidence.'),
      line(snap ? `Samples: ${snap.reviewed.poses.length}. Duration: ${snap.reviewed.duration.toFixed(2)} s.` : 'Model version: unavailable.'),
      line('Rehearsal results describe the model, not a prediction or a guarantee.'),
      ...(r.source === 'live' ? [line('Local model evidence is separate from the policy gate\'s signed action.')] : []),
    ];
    const asset = snap?.scene.assets.find(a => a.id === snap.asset_id);
    const key = r.tool === 'set_arm_velocity' ? 'deg_s' : r.tool === 'set_conveyor_speed' ? 'speed_pct' : r.tool === 'set_oven_setpoint' ? 'setpoint_c' : 'height_mm';
    const unit = key === 'deg_s' ? '°/s' : key === 'speed_pct' ? '%' : key === 'setpoint_c' ? '°C' : 'mm';
    const from = snap?.original.args[key]; const to = evidence.args[key];
    return [...header,
      line(asset?.label ?? r.asset_id ?? 'Recorded action', 0.012, ui.text, 700),
      line(`${from === undefined ? '' : `${from} → `}${to ?? 'Unavailable'} ${unit}`, 0.018, ui.text, 700),
      line('Original → reviewed', 0.0075, ui.muted),
      line(`Decided ${new Date(r.decided_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`),
      line(`Gesture: ${r.decision.gesture.replace(/_/g, ' ')}`),
      line(snap ? snap.reviewed.breach ? `Rehearsal: crossed ${snap.reviewed.breach.zone_label}.` : 'Rehearsal: within the retained envelope.' : 'Rehearsal outcome: unavailable.'),
      ...(r.source === 'live' ? [line(`Authorization: ${r.authorization?.status ?? 'unknown'}.`)] : []),
      line(r.decision.decision === 'ESCALATE' ? 'Action remains held for another reviewer.' : Proof.approval(r) ? r.source === 'demo' ? 'Execution: simulated.' : 'Physical execution: not requested or confirmed.' : 'Execution: not authorized.'),
      line(s.verified === null ? 'Proof: checking...' : s.verified ? r.source === 'demo' ? 'Proof: demo signature valid.' : 'Proof: matching checks passed.' : 'Proof: unverified.', 0.009, s.verified ? ui.accent : ui.warning),
    ];
  }
  private refreshControls(): void {
    const live = this.detailFor?.record.source === 'live';
    const key = `${this.page}:${this.textPage}:${this.pageCount}:${live}:${this.retrying}:${Palette.theme}:${Palette.isHighContrast}:${Palette.textScale}`;
    if (!this.controls || key === this.controlsKey) return;
    this.controlsKey = key; const ui = Palette.ui;
    const more = this.textPage < this.pageCount - 1 ? `More ${this.textPage + 1}/${this.pageCount}` : 'Back';
    const names = this.page === 'proof' ? [this.retrying ? 'Working...' : live ? 'Retry check' : 'Export proof', `Next ${this.textPage + 1}/${this.pageCount}`, 'Details'] : this.pageCount > 1 && this.page !== 'history' ? ['Previous', `Next ${this.textPage + 1}/${this.pageCount}`, 'Details'] : this.page === 'action' || this.page === 'menu' ? ['Rehearsal', 'Proof', 'Close'] : ['Original', 'Reviewed', more];
    for (const [n, id] of ['a', 'b', 'c'].entries()) {
      this.controls.requireElementById(id).setProperties(ControlStyle.properties());
      this.controls.requireElementById(id + '-label').setProperties({ text: names[n], fontSize: Palette.textScale, color: ui.text });
    }
  }
  update(delta: number): void {
    for (const s of this.seals) {
      if (s.entity.hasComponent(Grabbed)) continue;
      if (s.t < 1) {
        s.t = this.app.settings.get('reducedMotion') ? 1 : Math.min(1, s.t + delta * 1.4);
        const k = 1 - Math.pow(1 - s.t, 3);
        s.root.position.lerpVectors(s.from, s.home, k); s.root.position.y += Math.sin(k * Math.PI) * 0.05;
      } else s.root.position.copy(s.home);
    }
    this.detailRoot.visible = !!this.detailFor && !this.stage.settingsOpen && !this.endcard;
    if (this.detailFor && this.detailRoot.visible) {
      if (this.reach.outside(this.detailRoot, this.stage.head, this.stage.gaze, 0.28, 0.245)) this.placeDetail();
      const style = { background: Palette.ui.surface, border: Palette.ui.border, padding: 0.008, radius: 0.012 };
      const pages = this.detail.paginate(this.lines(this.detailFor), style, 2);
      this.pageCount = pages.length; this.textPage = Math.min(this.textPage, pages.length - 1);
      this.detail.draw(pages[this.textPage], style);
      this.caption.caption(this.stage.caption);
      this.detailRoot.userData.pagination = { page: this.textPage + 1, total: this.pageCount };
      this.detailRoot.userData.page = this.page; this.refreshControls();
      ReadingLayer.apply(this.detailRoot);
    }
  }
}
