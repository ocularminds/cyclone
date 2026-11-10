import { describe, expect, it } from 'vitest';
import { Layout } from '../src/models/layout';

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
});
