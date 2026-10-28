import type { Probe, Vec3 } from './envelope';

/**
 * Deterministic kinematic models of the twin's machines. Real-world units in
 * args are mapped to the 1:10 miniature with SCALE. These are a rehearsal
 * from the twin's model, never a physics prediction.
 */
export const SCALE = 0.1;

export type AssetSpec = {
  id: string;
  label: string;
  kind: 'conveyor' | 'arm' | 'oven' | 'lift' | 'shelf';
  position: Vec3;
  /** Envelope ids this machine's motion is checked against. */
  guards: string[];
  /** Static model parameters (base state, rates, geometry). */
  params: Record<string, number>;
  feeds?: string[];
};

/** Pose written by a model at normalised time t; also drives the ghost. */
export type Pose = Probe & {
  /** Machine-specific DOF: arm yaw (deg), lift height (m), oven temp (°C), belt offset (m). */
  dof: number;
  /** Secondary DOF: lift depth (m), belt speed (m/s). */
  dof2: number;
};

export abstract class Motion {
  constructor(readonly asset: AssetSpec) {}
  /** Real-time duration of the commanded motion, seconds. */
  abstract duration(args: Record<string, unknown>): number;
  /** Write the pose at normalised time t ∈ [0,1] into `out`. */
  abstract sample(args: Record<string, unknown>, t: number, out: Pose): void;

  protected num(args: Record<string, unknown>, key: string, fallback: number): number {
    const v = args[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }

  protected p(key: string, fallback = 0): number {
    return this.asset.params[key] ?? fallback;
  }

  static blank(): Pose {
    return { center: [0, 0, 0], half: [0, 0, 0], scalar: 0, dof: 0, dof2: 0 };
  }
}

/** Robot arm yaw sweep with trapezoidal profile and ω²/2α braking overshoot. */
export class ArmMotion extends Motion {
  /** Peak yaw (deg) reached for a commanded velocity. */
  peak(degS: number): number {
    return this.p('target') + (degS * degS) / (2 * this.p('decel', 1200));
  }

  duration(args: Record<string, unknown>): number {
    const w = Math.max(1, this.num(args, 'deg_s', 100));
    const travel = this.peak(w) - this.p('start');
    const settle = this.peak(w) - this.p('target');
    return travel / w + w / this.p('decel', 1200) + settle / 60 + 0.2;
  }

  sample(args: Record<string, unknown>, t: number, out: Pose): void {
    const w = Math.max(1, this.num(args, 'deg_s', 100));
    const start = this.p('start');
    const target = this.p('target');
    const peak = this.peak(w);
    // 0..0.8: ease to the peak (overshoot included); 0.8..1: settle back to target
    let yaw: number;
    if (t <= 0.8) {
      const u = t / 0.8;
      yaw = start + (peak - start) * (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
    } else {
      const u = (t - 0.8) / 0.2;
      yaw = peak + (target - peak) * u * u * (3 - 2 * u);
    }
    const rad = (yaw * Math.PI) / 180;
    const [bx, , bz] = this.asset.position;
    const reach = this.p('reach', 0.1);
    const tool = this.p('tool', 0.01);
    out.center[0] = bx + reach * Math.cos(rad);
    out.center[1] = this.p('height', 0.06);
    out.center[2] = bz + reach * Math.sin(rad);
    out.half[0] = out.half[1] = out.half[2] = tool;
    out.scalar = w;
    out.dof = yaw;
    out.dof2 = w;
  }
}

/** Conveyor belt speed change: boxes travel at base × (1 + pct/100). */
export class ConveyorMotion extends Motion {
  speed(args: Record<string, unknown>): number {
    return this.p('base_speed', 0.5) * (1 + this.num(args, 'speed_pct', 0) / 100);
  }

  duration(): number {
    return 4;
  }

  sample(args: Record<string, unknown>, t: number, out: Pose): void {
    const speed = this.speed(args);
    const length = this.p('length', 0.22);
    const offset = (speed * SCALE * t * this.duration()) % length;
    const [x, y, z] = this.asset.position;
    out.center[0] = x - length / 2 + offset;
    out.center[1] = y + 0.04;
    out.center[2] = z;
    out.half[0] = out.half[1] = out.half[2] = 0.012;
    out.scalar = speed;
    out.dof = offset;
    out.dof2 = speed;
  }
}

/** Oven setpoint ramp at a fixed rate from the current temperature. */
export class OvenMotion extends Motion {
  duration(args: Record<string, unknown>): number {
    const span = Math.abs(this.num(args, 'setpoint_c', this.p('current')) - this.p('current'));
    return Math.max(1, span / this.p('ramp', 2));
  }

  sample(args: Record<string, unknown>, t: number, out: Pose): void {
    const from = this.p('current', 380);
    const to = this.num(args, 'setpoint_c', from);
    const temp = from + (to - from) * t;
    const [x, y, z] = this.asset.position;
    out.center[0] = x;
    out.center[1] = y + 0.05;
    out.center[2] = z;
    out.half[0] = out.half[1] = out.half[2] = 0.03;
    out.scalar = temp;
    out.dof = temp;
    out.dof2 = to;
  }
}

/** Pallet lift: raise to height_mm, then push the pallet back into the bay. */
export class LiftMotion extends Motion {
  duration(): number {
    return 6;
  }

  sample(args: Record<string, unknown>, t: number, out: Pose): void {
    const [x, y, z] = this.asset.position;
    const height = this.num(args, 'height_mm', 1400) * 0.001 * SCALE;
    const depth = this.p('depth', 0.07);
    const raise = Math.min(1, t / 0.5);
    const push = Math.max(0, (t - 0.5) / 0.5);
    const ease = (u: number) => u * u * (3 - 2 * u);
    out.center[0] = x;
    out.center[1] = y + this.p('rest', 0.012) + (height - this.p('rest', 0.012)) * ease(raise);
    out.center[2] = z - depth * ease(push);
    out.half[0] = this.p('half_x', 0.025);
    out.half[1] = this.p('half_y', 0.008);
    out.half[2] = this.p('half_z', 0.02);
    out.scalar = height;
    out.dof = out.center[1] - y;
    out.dof2 = z - out.center[2];
  }
}

export class Motions {
  static for(tool: string, asset: AssetSpec): Motion {
    switch (tool) {
      case 'set_arm_velocity':
        return new ArmMotion(asset);
      case 'set_conveyor_speed':
        return new ConveyorMotion(asset);
      case 'set_oven_setpoint':
        return new OvenMotion(asset);
      case 'lift_pallet':
        return new LiftMotion(asset);
      default:
        throw new Error(`NO_MOTION_MODEL:${tool}`);
    }
  }
}
