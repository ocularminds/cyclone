import { createSystem, Grabbed, OneHandGrabbable, Vector3, type Entity, type Group } from '@iwsdk/core';
import type { Cyclone } from '../app';
import { SealTag } from '../components';
import { isLive, type SignedRecord } from '../contracts/intent';
import { Glyph } from '../core/glyph';
import { Layout } from '../models/layout';
import { Tokens, type SealKind } from '../models/token';
import type { Stage } from '../stage';
import { Label, type Line } from '../ui/label';

type SealView = { record: SignedRecord; entity: Entity; root: Group; home: Vector3; from: Vector3; t: number; verified: boolean | null };

/**
 * SealSystem (C10, C11, C39, C49): every decision becomes a signed record shown
 * as a seal crystal stamped with the glyph of the hash it was decided on — the
 * same rune the token showed — landing on the ledger shelf. Pick one up to
 * replay the rehearsal seen at decision time and read its verification.
 */
export class SealSystem extends createSystem({
  grabbed: { required: [SealTag, Grabbed] },
}) {
  static readonly SHOWN = 15;
  private app!: Cyclone;
  private stage!: Stage;
  private readonly seals: SealView[] = [];
  private detail!: Label;
  private detailFor: SealView | null = null;
  private readonly v = new Vector3();
  private endcard = false;

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    this.endcard = this.app.boot.capture === 'endcard';
    this.detail = new Label(0.16, 0.085);
    this.detail.mesh.visible = false;
    this.stage.root.add(this.detail.mesh);
    for (const r of this.app.ledger.all().slice(-SealSystem.SHOWN)) this.add(r, null);
    const onRecord = ({ token, record }: { token: { id: string }; record: SignedRecord }) => {
      const view = this.stage.views.get(token.id);
      const from = view ? view.object.position.clone() : null;
      this.add(record, from);
      const glyph = Glyph.from(record.amended_hash ?? record.intent_hash);
      this.app.cue('seal', `Sealed ${SealSystem.kindOf(record)} · glyph ${glyph.label}`, [...Layout.LEDGER]);
    };
    this.cleanupFuncs.push(
      this.app.shift.events.on('sealed', onRecord),
      this.app.shift.events.on('escalated', onRecord),
      this.app.shift.events.on('auto', onRecord),
      this.queries.grabbed.subscribe('qualify', (e) => this.pickUp(e)),
      this.queries.grabbed.subscribe('disqualify', (e) => {
        const s = this.seals.find((x) => x.entity === e);
        if (s) {
          s.from.copy(s.root.position);
          s.t = 0;
        }
        this.detailFor = null;
      }),
    );
  }

  static kindOf(r: SignedRecord): SealKind {
    switch (r.decision.decision) {
      case 'APPROVE':
        return 'approve';
      case 'APPROVE_AMENDED':
        return 'amended';
      case 'ESCALATE':
        return 'escalate';
      case 'AUTO_APPROVE_RULE':
        return 'auto';
      default:
        return r.decision.reason?.code === 'expired' ? 'expired' : 'reject';
    }
  }

  private add(record: SignedRecord, from: Vector3 | null): void {
    const glyph = Glyph.from(record.amended_hash ?? record.intent_hash);
    const view: SealView = {
      record,
      entity: null!,
      root: null!,
      home: new Vector3(),
      from: new Vector3(),
      t: from ? 0 : 1,
      verified: isLive(record.verification)
        ? record.verification.verified && record.verification.required_artifact_coverage_verified && record.verification.trust_anchor === 'DECIONIS_OFFICIAL'
        : null,
    };
    view.root = Tokens.seal(SealSystem.kindOf(record), glyph, view.verified !== false);
    view.entity = this.world.createTransformEntity(view.root, { parent: this.stage.rootEntity! });
    view.entity.addComponent(SealTag, { recordId: record.record_id });
    view.entity.addComponent(OneHandGrabbable, { rotate: true, translate: true });
    this.seals.push(view);
    if (view.verified === null) {
      void this.app.signer.verify(record).then((ok) => (view.verified = ok));
    }
    while (this.seals.length > SealSystem.SHOWN) this.seals.shift()!.entity.dispose();
    this.layout();
    if (from) view.from.copy(from);
    else view.root.position.copy(view.home);
  }

  private layout(): void {
    this.seals.forEach((s, i) => {
      const spot = this.endcard ? ([Layout.LEDGER[0] - 0.036 + (i % 5) * 0.018, 0.022 + Math.floor(i / 5) * 0.034, Layout.LEDGER[2] - Math.floor(i / 5) * 0.012] as const) : Layout.sealSpot(i);
      s.home.set(spot[0], spot[1], spot[2]);
      if (s.t >= 1) {
        s.from.copy(s.root.position);
        s.t = 0;
      }
    });
  }

  /** C11: picking up a seal replays exactly what was rehearsed at decision time. */
  private pickUp(e: Entity): void {
    const s = this.seals.find((x) => x.entity === e);
    if (!s) return;
    const r = s.record;
    if (r.tool && r.asset_id) {
      this.app.bus.emit('replay', {
        tool: r.tool,
        asset_id: r.asset_id,
        args: r.rehearsal.args,
        label: `Replay: ${SealSystem.kindOf(r)} ${new Date(r.decided_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      });
    }
    this.detailFor = s;
    this.app.cue('unfold', 'Seal picked up: replaying its rehearsal');
  }

  /** Honest issuer labels (C39): a provisional anonymous workspace is said plainly. */
  static tier(t: string): string {
    if (t === 'owned') return 'owned workspace';
    if (t === 'provisional_anonymous') return 'provisional anonymous workspace (not an owned identity)';
    return 'unknown issuer';
  }

  private lines(s: SealView): Line[] {
    const r = s.record;
    const glyph = Glyph.from(r.amended_hash ?? r.intent_hash);
    const out: Line[] = [
      { text: `${SealSystem.kindOf(r).toUpperCase()} · ${r.decision.gesture.replace(/_/g, ' ')}`, size: 0.009, weight: 700 },
      { text: `Glyph ${glyph.label} · ${(r.amended_hash ?? r.intent_hash).slice(0, 19)}…`, size: 0.0072 },
    ];
    const v = r.verification;
    if (isLive(v)) {
      const ok = s.verified === true;
      out.push({ text: ok ? 'Verified: signatures, coverage, official trust anchor' : 'Unverified — never executable', size: 0.0075, weight: 600, color: ok ? '#2f6fb8' : '#a8287f' });
      out.push({ text: `Issuer: ${SealSystem.tier(v.issuer_tier)}`, size: 0.0068 });
      out.push({ text: v.assurance_scope_summary, size: 0.0064, color: '#5d6b78' });
    } else {
      out.push({
        text: s.verified === null ? 'Demo signature: checking…' : s.verified ? 'Demo signature valid (local demo key, not an official anchor)' : 'Demo signature INVALID',
        size: 0.0072,
        color: s.verified === false ? '#a8287f' : '#5d6b78',
      });
    }
    return out;
  }

  update(delta: number): void {
    for (const s of this.seals) {
      if (s.entity.hasComponent(Grabbed)) continue;
      if (s.t < 1) {
        s.t = Math.min(1, s.t + delta * 1.4);
        const k = 1 - Math.pow(1 - s.t, 3);
        s.root.position.lerpVectors(s.from, s.home, k);
        s.root.position.y += Math.sin(k * Math.PI) * 0.05;
      } else s.root.position.copy(s.home);
      if (this.endcard) s.root.rotation.y += delta * 0.15;
    }
    const d = this.detailFor;
    this.detail.mesh.visible = !!d;
    if (d) {
      this.detail.draw(this.lines(d), { background: '#f6efe2', border: '#6e4f37', padding: 0.006, radius: 0.006 });
      d.root.getWorldPosition(this.v);
      this.stage.toDesk(this.v);
      this.detail.mesh.position.set(this.v.x + 0.1, this.v.y + 0.06, this.v.z);
      this.detail.mesh.lookAt(this.v.copy(this.stage.head).applyMatrix4(this.stage.root.matrixWorld));
    }
  }
}
