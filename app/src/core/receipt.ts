import type { HeldIntent, IntentBinding, Rehearsed, SignedRecord } from '../contracts/intent';
import type { Pose } from '../sim/kinematics';
import type { Breach, RehearsalResult, TwinLayout } from '../sim/rehearsal';
import { Rehearsal } from '../sim/rehearsal';
import { Canon } from './canon';
import { IntentHasher } from './hash';
import { Proof } from './proof';

type SavedPath = { args: Record<string, unknown>; duration: number; samples: number[]; poses: Pose[]; breach: Breach | null; affected: string[] };
export type RehearsalSnapshot = {
  version: 'cyclone.rehearsal/1'; model: 'cyclone.kinematics/1';
  units: { space: 'metres'; time: 'seconds'; arm: 'degrees'; oven: 'degrees Celsius'; lift: 'millimetres' };
  tool: string; asset_id: string; scene: TwinLayout;
  original_binding: IntentBinding; reviewed_binding: IntentBinding;
  original_hash: string; reviewed_hash: string;
  original: SavedPath; reviewed: SavedPath;
};

/** Local model evidence, explicitly separate from the policy gate's action hash/proof. */
export class Receipt {
  /** Shape validation is separate from integrity, so malformed storage is safe to inspect. */
  static snapshot(record: SignedRecord): RehearsalSnapshot | null {
    try {
      const s = (record.local_rehearsal ?? record.rehearsal)?.snapshot;
      const vec = (v: unknown, n = 3): v is number[] => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
      const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
      const path = (p: SavedPath) => !!p && object(p.args) && Number.isFinite(p.duration) && p.duration > 0 &&
        Array.isArray(p.poses) && p.poses.length >= 2 && p.poses.length <= 4096 &&
        Array.isArray(p.samples) && p.samples.length === p.poses.length * 4 && p.samples.every(Number.isFinite) &&
        p.poses.every(v => v && vec(v.center) && vec(v.half) && v.half.every(x => x >= 0) && [v.dof, v.dof2, v.scalar].every(Number.isFinite)) &&
        Array.isArray(p.affected) && p.affected.every(v => typeof v === 'string') &&
        (p.breach === null || !!p.breach && vec(p.breach.position) && Number.isFinite(p.breach.t) && p.breach.t >= 0 && p.breach.t <= 1 && typeof p.breach.zone_id === 'string' && typeof p.breach.zone_label === 'string');
      if (!s || s.version !== 'cyclone.rehearsal/1' || s.model !== 'cyclone.kinematics/1' ||
        typeof s.tool !== 'string' || typeof s.asset_id !== 'string' || !path(s.original) || !path(s.reviewed) ||
        !s.original_binding?.action || !s.reviewed_binding?.action || !s.scene || !vec(s.scene.size, 2) ||
        !s.scene.size.every(x => x > 0) || !Array.isArray(s.scene.assets) || !Array.isArray(s.scene.zones)) return null;
      if (!s.scene.assets.every(a => a && typeof a.id === 'string' && typeof a.label === 'string' &&
        ['conveyor', 'arm', 'oven', 'lift', 'shelf'].includes(a.kind) && vec(a.position) &&
        object(a.params) && Object.values(a.params).every(Number.isFinite) && Array.isArray(a.guards) && a.guards.every(x => typeof x === 'string'))) return null;
      if (!s.scene.assets.some(a => a.id === s.asset_id) || !s.scene.zones.every(z => z && typeof z.id === 'string' && typeof z.label === 'string' &&
        (z.kind === 'box' ? vec(z.min) && vec(z.max) && z.min.every((v, i) => v <= z.max[i]) :
          z.kind === 'limit' && typeof z.asset_id === 'string' && Number.isFinite(z.max) && typeof z.unit === 'string'))) return null;
      return s;
    } catch { return null; }
  }
  static async capture(model: Rehearsal, intent: HeldIntent, args: Record<string, unknown>): Promise<Rehearsed> {
    const save = (r: RehearsalResult): SavedPath => ({
      args: structuredClone(r.args), duration: r.duration, samples: [...r.samples],
      poses: structuredClone(r.poses), breach: structuredClone(r.breach), affected: [...r.affected],
    });
    const original = model.run(intent.tool, intent.target.asset_id, intent.args);
    const reviewed = model.run(intent.tool, intent.target.asset_id, args);
    const binding = IntentHasher.amend(intent.binding!, args);
    const snapshot: RehearsalSnapshot = {
      version: 'cyclone.rehearsal/1', model: 'cyclone.kinematics/1',
      units: { space: 'metres', time: 'seconds', arm: 'degrees', oven: 'degrees Celsius', lift: 'millimetres' },
      tool: intent.tool, asset_id: intent.target.asset_id, scene: structuredClone(model.twin),
      original_binding: structuredClone(intent.binding!), reviewed_binding: structuredClone(binding),
      original_hash: intent.intent_hash, reviewed_hash: (await IntentHasher.hash(binding)).intent_hash,
      original: save(original), reviewed: save(reviewed),
    };
    return { args: structuredClone(args), path_samples_ref: await Receipt.digest(snapshot), snapshot };
  }

  static async digest(snapshot: RehearsalSnapshot): Promise<string> {
    return `rehearsal:sha256:${await Canon.sha256(Canon.stringify(snapshot))}`;
  }

  static async check(record: SignedRecord): Promise<boolean> {
    try {
      if (!Proof.readable(record) || !Proof.matches(record, record.decision)) return false;
      const r = record.local_rehearsal ?? record.rehearsal, s = Receipt.snapshot(record);
      if (!s || s.tool !== record.tool || s.asset_id !== record.asset_id) return false;
      const same = (a: unknown, b: unknown) => Canon.stringify(a) === Canon.stringify(b);
      if (!same(s.units, { space: 'metres', time: 'seconds', arm: 'degrees', oven: 'degrees Celsius', lift: 'millimetres' }) ||
        s.original_binding.action.type !== s.tool || s.original_binding.action.resource !== s.asset_id ||
        !same(s.original.args, s.original_binding.action.parameters) || !same(s.reviewed.args, r.args) ||
        !same(s.reviewed_binding, IntentHasher.amend(s.original_binding, r.args))) return false;
      if (record.decision.decision === 'APPROVE_AMENDED') {
        if (!record.amended_hash || record.amended_hash === record.intent_hash || !same(record.decision.amended_args, r.args)) return false;
      } else if (Proof.approval(record) && s.reviewed_hash !== s.original_hash) return false;
      if (record.decision.reason?.code === 'counter_offer' &&
        !same(r.args, { ...s.original.args, ...record.decision.reason.suggested })) return false;
      return await Receipt.digest(s) === r.path_samples_ref &&
        s.original_hash === record.intent_hash && s.original_binding.intent_id === record.intent_id &&
        (await IntentHasher.hash(s.original_binding)).intent_hash === s.original_hash &&
        (await IntentHasher.hash(s.reviewed_binding)).intent_hash === s.reviewed_hash &&
        Canon.stringify(s.reviewed_binding.action.parameters) === Canon.stringify(r.args) &&
        (!record.amended_hash || record.amended_hash === s.reviewed_hash);
    } catch { return false; }
  }

  static result(record: SignedRecord, original = false): RehearsalResult | null {
    const evidence = record.local_rehearsal ?? record.rehearsal;
    const snapshot = Receipt.snapshot(record);
    if (!snapshot) return null;
    const path = original ? snapshot.original : snapshot.reviewed;
    return {
      ...structuredClone(path), key: `${evidence.path_samples_ref}:${original ? 'original' : 'reviewed'}`,
      tool: snapshot.tool, asset_id: snapshot.asset_id, samples: new Float32Array(path.samples),
      historical: { asset: snapshot.scene.assets.find(a => a.id === snapshot.asset_id)!, zones: snapshot.scene.zones },
    };
  }

  /** Both current and historical rendering interpolate the same retained samples. */
  static pose(result: RehearsalResult, t: number, out: Pose): Pose {
    const cursor = Math.max(0, Math.min(1, t)) * (result.poses.length - 1);
    const a = result.poses[Math.floor(cursor)], b = result.poses[Math.ceil(cursor)];
    const f = cursor - Math.floor(cursor);
    for (let axis = 0; axis < 3; axis++) {
      out.center[axis] = a.center[axis] + (b.center[axis] - a.center[axis]) * f;
      out.half[axis] = a.half[axis] + (b.half[axis] - a.half[axis]) * f;
    }
    out.scalar = a.scalar + (b.scalar - a.scalar) * f;
    out.dof = a.dof + (b.dof - a.dof) * f;
    out.dof2 = a.dof2 + (b.dof2 - a.dof2) * f;
    return out;
  }
}
