import { Canon } from '../core/canon';
import { Envelope, type Vec3, type Zone } from './envelope';
import { Motions, Motion, type AssetSpec, type Pose } from './kinematics';

export type TwinLayout = {
  size: [number, number];
  assets: AssetSpec[];
  zones: Zone[];
};

export type Breach = { t: number; position: Vec3; zone_id: string; zone_label: string };

export type RehearsalResult = {
  key: string;
  tool: string;
  asset_id: string;
  args: Record<string, unknown>;
  /** Real-time seconds of the commanded motion (real-speed replay, C06). */
  duration: number;
  /** N × [x, y, z, dof] probe samples at uniform normalised time. */
  samples: Float32Array;
  breach: Breach | null;
  /** Blast radius: target asset, downstream assets, breached zones (C38). */
  affected: string[];
};

/**
 * GhostRehearsal core: sample the commanded motion, test it against the
 * envelopes, locate the first breach exactly (coarse-then-fine), derive the
 * blast radius. Same function powers scrub, live re-rehearsal, the real-speed
 * hold replay, drill reveal and ledger replay. Pure and deterministic.
 */
export class Rehearsal {
  static readonly SAMPLES = 64;
  private readonly envelope: Envelope;
  private readonly assets = new Map<string, AssetSpec>();
  private readonly cache = new Map<string, RehearsalResult>();
  private readonly pose: Pose = Motion.blank();

  constructor(readonly twin: TwinLayout) {
    this.envelope = new Envelope(twin.zones);
    for (const a of twin.assets) this.assets.set(a.id, a);
  }

  asset(id: string): AssetSpec | undefined {
    return this.assets.get(id);
  }

  zone(id: string): Zone | undefined {
    return this.envelope.get(id);
  }

  static key(tool: string, assetId: string, args: Record<string, unknown>): string {
    return `${tool}|${assetId}|${Canon.stringify(args)}`;
  }

  /** Stable reference stored in SignedRecord.rehearsal.path_samples_ref. */
  static async ref(tool: string, assetId: string, args: Record<string, unknown>): Promise<string> {
    return `rehearsal:${(await Canon.sha256(Rehearsal.key(tool, assetId, args))).slice(0, 16)}`;
  }

  run(tool: string, assetId: string, args: Record<string, unknown>): RehearsalResult {
    const key = Rehearsal.key(tool, assetId, args);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const asset = this.assets.get(assetId);
    if (!asset) throw new Error(`UNKNOWN_ASSET:${assetId}`);
    const motion = this.motion(tool, assetId);
    const n = Rehearsal.SAMPLES;
    const samples = new Float32Array(n * 4);
    let firstBad = -1;
    let zone: Zone | null = null;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      motion.sample(args, t, this.pose);
      samples.set([...this.pose.center, this.pose.dof], i * 4);
      if (firstBad < 0) {
        const z = this.envelope.breach(this.pose, asset.guards);
        if (z) {
          firstBad = i;
          zone = z;
        }
      }
    }
    let breach: Breach | null = null;
    if (firstBad >= 0 && zone) {
      const t = this.refine(motion, args, asset.guards, firstBad);
      motion.sample(args, t, this.pose);
      breach = {
        t,
        position: [...this.pose.center] as Vec3,
        zone_id: zone.id,
        zone_label: zone.label,
      };
    }
    const affected = [asset.id, ...(asset.feeds ?? [])];
    if (breach) affected.push(breach.zone_id);
    const result: RehearsalResult = {
      key,
      tool,
      asset_id: assetId,
      args: { ...args },
      duration: motion.duration(args),
      samples,
      breach,
      affected,
    };
    if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, result);
    return result;
  }

  /** Bisection between the last clear sample and the first breaching one. */
  private refine(motion: Motion, args: Record<string, unknown>, guards: string[], bad: number): number {
    const n = Rehearsal.SAMPLES;
    if (bad === 0) return 0;
    let lo = (bad - 1) / (n - 1);
    let hi = bad / (n - 1);
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      motion.sample(args, mid, this.pose);
      if (this.envelope.breach(this.pose, guards)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  /** Pose at normalised time t (scrub / replay); writes into `out`. */
  poseAt(tool: string, assetId: string, args: Record<string, unknown>, t: number, out: Pose): Pose {
    this.motion(tool, assetId).sample(args, Math.min(1, Math.max(0, t)), out);
    return out;
  }

  private readonly motions = new Map<string, Motion>();

  motion(tool: string, assetId: string): Motion {
    const k = `${tool}|${assetId}`;
    let m = this.motions.get(k);
    if (!m) {
      const asset = this.assets.get(assetId);
      if (!asset) throw new Error(`UNKNOWN_ASSET:${assetId}`);
      this.motions.set(k, (m = Motions.for(tool, asset)));
    }
    return m;
  }
}
