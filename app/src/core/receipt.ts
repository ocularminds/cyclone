import type { HeldIntent, IntentBinding, Rehearsed, SignedRecord } from '../contracts/intent';
import type { Pose } from '../sim/kinematics';
import type { Breach, RehearsalResult, TwinLayout } from '../sim/rehearsal';
import { Rehearsal } from '../sim/rehearsal';
import { Canon } from './canon';
import { IntentHasher } from './hash';

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
    const r = record.local_rehearsal ?? record.rehearsal;
    const s = r.snapshot;
    if (!s || s.version !== 'cyclone.rehearsal/1' || !s.reviewed.poses?.length) return false;
    try {
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
    const snapshot = evidence.snapshot;
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
