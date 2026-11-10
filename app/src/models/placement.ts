import { Layout, type XYZ } from './layout';

type Point = readonly [number, number];
type Rect = { x: readonly [number, number]; z: readonly [number, number] };

/** Table support and seated reach are evaluated in the proposed desk frame. */
export class Placement {
  static contains(polygon: readonly Point[], x: number, z: number): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [ax, az] = polygon[j], [bx, bz] = polygon[i];
      const cross = (x - ax) * (bz - az) - (z - az) * (bx - ax);
      if (Math.abs(cross) < 1e-8 && x >= Math.min(ax, bx) - 1e-6 && x <= Math.max(ax, bx) + 1e-6 && z >= Math.min(az, bz) - 1e-6 && z <= Math.max(az, bz) + 1e-6) return true;
      if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    }
    return inside;
  }
  static fits(polygon: readonly Point[], head: XYZ): boolean {
    if (polygon.length < 3 || polygon.some(p => p.some(x => !Number.isFinite(x))) || head.some(x => !Number.isFinite(x))) return false;
    const footprints: Rect[] = [
      { x: [-0.3, 0.3], z: [Layout.TWIN[2] - 0.2, Layout.TWIN[2] + 0.2] },
      { x: [Layout.TRAY[0] - 0.106, Layout.TRAY[0] + 0.106], z: [Layout.TRAY[2] - 0.025, Layout.TRAY[2] + 0.025] },
      { x: [Layout.LEDGER[0] - 0.063, Layout.LEDGER[0] + 0.063], z: [Layout.LEDGER[2] - 0.061, Layout.LEDGER[2] + 0.013] },
      { x: [Layout.RACK[0] - 0.025, Layout.RACK[0] + 0.027], z: [Layout.RACK[2] - 0.028, Layout.RACK[2] + 0.062] },
    ];
    const volumes = Layout.volumes();
    for (const { at, half } of volumes) footprints.push({ x: [at[0] - half[0], at[0] + half[0]], z: [at[2] - half[2], at[2] + half[2]] });
    return footprints.every(rect => Placement.supports(polygon, rect)) && volumes.every(({ at, half }) => {
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        const corner: XYZ = [at[0] + x * half[0], at[1] + y * half[1], at[2] + z * half[2]];
        if (Layout.distanceToHead(corner, head) > Layout.REACH || corner[2] >= head[2]) return false;
      }
      return true;
    });
  }
  /** Exact polygon/rectangle containment, including narrow concave notches between samples. */
  static supports(polygon: readonly Point[], rect: Rect): boolean {
    if (!rect.x.every(Number.isFinite) || !rect.z.every(Number.isFinite)) return false;
    if (!rect.x.every(x => rect.z.every(z => Placement.contains(polygon, x, z)))) return false;
    // Any table-boundary segment crossing the open rectangle cuts its support.
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      let low = 0, high = 1;
      for (let axis = 0; axis < 2; axis++) {
        const range = axis === 0 ? rect.x : rect.z, start = a[axis], delta = b[axis] - start;
        if (Math.abs(delta) < 1e-10) { if (start <= range[0] + 1e-7 || start >= range[1] - 1e-7) high = -1; }
        else {
          const u = (range[0] + 1e-7 - start) / delta, v = (range[1] - 1e-7 - start) / delta;
          low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v));
        }
      }
      if (low <= high) return false;
    }
    return true;
  }
  /** Corners of a head-facing panel; angles are relative to its intended view direction. */
  static panel(width: number, height: number, distance: number, liftDegrees = 0) {
    return {
      reach: Math.hypot(distance, width / 2, height / 2),
      horizontal: Math.atan2(width / 2, distance) * 180 / Math.PI,
      vertical: Math.atan2(height / 2, distance) * 180 / Math.PI + Math.abs(liftDegrees),
    };
  }
}
