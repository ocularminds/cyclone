import { describe, expect, it } from 'vitest';
import { ArmMotion, Motion } from '../src/sim/kinematics';
import { Rehearsal, type TwinLayout } from '../src/sim/rehearsal';
import twin from '../src/scenario/twin.json';

const sim = new Rehearsal(twin as unknown as TwinLayout);

describe('kinematics + envelopes (C03, C04, C32)', () => {
  it('arm at 250°/s breaches walkway W1; 180°/s does not', () => {
    const fast = sim.run('set_arm_velocity', 'arm-cell-3', { cell: 3, joint: 'axis_3', deg_s: 250 });
    expect(fast.breach?.zone_id).toBe('walkway-w1');
    expect(fast.affected).toContain('walkway-w1');
    const safe = sim.run('set_arm_velocity', 'arm-cell-3', { cell: 3, joint: 'axis_3', deg_s: 180 });
    expect(safe.breach).toBeNull();
  });

  it('locates the breach exactly at the envelope crossing', () => {
    const r = sim.run('set_arm_velocity', 'arm-cell-3', { deg_s: 250 });
    const pose = Motion.blank();
    const zone = twin.zones.find((z) => z.id === 'walkway-w1')!;
    sim.poseAt('set_arm_velocity', 'arm-cell-3', { deg_s: 250 }, r.breach!.t, pose);
    // probe edge sits on the walkway's near face (within bisection tolerance)
    expect(pose.center[2] + pose.half[2]).toBeCloseTo(zone.min![2], 3);
    sim.poseAt('set_arm_velocity', 'arm-cell-3', { deg_s: 250 }, r.breach!.t - 1e-3, pose);
    expect(pose.center[2] + pose.half[2]).toBeLessThan(zone.min![2]);
  });

  it('the breach clears between 180 and 190°/s as the dial turns', () => {
    const arm = new ArmMotion(twin.assets.find((a) => a.id === 'arm-cell-3') as never);
    expect(arm.peak(180)).toBeLessThan(arm.peak(190));
    for (const v of [60, 100, 150, 170, 180]) expect(sim.run('set_arm_velocity', 'arm-cell-3', { deg_s: v }).breach).toBeNull();
    for (const v of [190, 200, 250, 300]) expect(sim.run('set_arm_velocity', 'arm-cell-3', { deg_s: v }).breach).not.toBeNull();
  });

  it('oven setpoint 450°C crosses the 420°C hard limit; 400°C does not', () => {
    const hot = sim.run('set_oven_setpoint', 'oven-b', { zone: 'B', setpoint_c: 450 });
    expect(hot.breach?.zone_id).toBe('oven-b-limit');
    expect(hot.breach!.t).toBeCloseTo((420 - 380) / (450 - 380), 3);
    expect(sim.run('set_oven_setpoint', 'oven-b', { zone: 'B', setpoint_c: 400 }).breach).toBeNull();
  });

  it('drill pallet lift at 1150 mm clips shelf S2; 1400 mm clears', () => {
    const low = sim.run('lift_pallet', 'lift-2', { height_mm: 1150 });
    expect(low.breach?.zone_id).toBe('shelf-s2-beam');
    expect(low.breach!.t).toBeGreaterThan(0.5); // raise is clear; the push into the bay clips
    expect(sim.run('lift_pallet', 'lift-2', { height_mm: 1400 }).breach).toBeNull();
  });

  it('conveyor +10% stays under its rated speed', () => {
    const r = sim.run('set_conveyor_speed', 'conv-1', { line: 1, speed_pct: 10 });
    expect(r.breach).toBeNull();
    expect(r.affected).toEqual(['conv-1', 'lift-2']);
    expect(sim.run('set_conveyor_speed', 'conv-1', { speed_pct: 25 }).breach?.zone_id).toBe('conv-1-rated');
  });

  it('is deterministic and cached', () => {
    const a = sim.run('set_arm_velocity', 'arm-cell-3', { deg_s: 230 });
    const b = new Rehearsal(twin as unknown as TwinLayout).run('set_arm_velocity', 'arm-cell-3', { deg_s: 230 });
    expect(Array.from(a.samples)).toEqual(Array.from(b.samples));
    expect(sim.run('set_arm_velocity', 'arm-cell-3', { deg_s: 230 })).toBe(a);
  });

  it('re-rehearses within a frame budget', () => {
    const t0 = performance.now();
    for (let v = 60; v <= 300; v += 10) sim.run('set_arm_velocity', 'arm-cell-3', { deg_s: v, k: 'perf' });
    expect((performance.now() - t0) / 25).toBeLessThan(2);
  });
});
