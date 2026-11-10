import { describe, expect, it } from 'vitest';
import { Layout } from '../src/models/layout';
import { Placement } from '../src/models/placement';

describe('reach and placement (C21)', () => {
  it('every interactable is within 0.61 m of the nominal seated head and in front of it', () => {
    const far = Layout.interactables()
      .map((i) => ({ ...i, d: Layout.distanceToHead(i.at) }))
      .filter((i) => i.d > Layout.REACH || i.at[2] > Layout.HEAD[2]);
    expect(far).toEqual([]);
  });

  it('the tabletop twin is 60×40 cm and sits on the plinth', () => {
    expect(Layout.PLINTH.x[1] - Layout.PLINTH.x[0]).toBeGreaterThanOrEqual(0.6);
    expect(Layout.TWIN[2] - 0.2).toBeGreaterThanOrEqual(Layout.PLINTH.z[0]);
  });

  it('ledger crystals have at least 16 mm clearance between their 19 mm bases', () => {
    for (let a = 0; a < 15; a++) for (let b = a + 1; b < 15; b++) {
      const p = Layout.sealSpot(a), q = Layout.sealSpot(b);
      expect(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])).toBeGreaterThanOrEqual(0.035);
    }
  });
  it('fits complete station volumes and the board, rejecting sub-grid notches and rotated small tables', () => {
    const full = [[-0.6, -0.8], [0.6, -0.8], [0.6, 0], [-0.6, 0]] as const;
    expect(Placement.fits(full, Layout.HEAD)).toBe(true);
    const notch = [[-0.6, -0.8], [0.005, -0.8], [0.005, -0.40], [0.009, -0.40], [0.009, -0.8], [0.6, -0.8], [0.6, 0], [-0.6, 0]] as const;
    expect(Placement.fits(notch, Layout.HEAD)).toBe(false);
    expect(Placement.fits([[0, -0.65], [0.34, -0.32], [0, 0], [-0.34, -0.32]], Layout.HEAD)).toBe(false);
    expect(Placement.fits([[-0.3, -0.51], [0.3, -0.51], [0.3, -0.11], [-0.3, -0.11]], Layout.HEAD)).toBe(false);
    for (const v of Layout.volumes()) for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      expect(Layout.distanceToHead([v.at[0] + v.half[0] * x, v.at[1] + v.half[1] * y, v.at[2] + v.half[2] * z]), v.name).toBeLessThanOrEqual(0.61);
    }
  });
});
