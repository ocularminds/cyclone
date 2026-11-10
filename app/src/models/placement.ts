import { Layout, type XYZ } from './layout';

type Point = readonly [number, number];

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
    if (polygon.length < 3 || head.some(x => !Number.isFinite(x))) return false;
    // Sample the full 60 x 40 cm board, including its perimeter: a nearby small
    // or concave surface cannot qualify merely because its nearest edge fits.
    for (let x = -0.30; x <= 0.3001; x += 0.02) for (let z = -0.20; z <= 0.2001; z += 0.02) {
      if (!Placement.contains(polygon, x + Layout.TWIN[0], z + Layout.TWIN[2])) return false;
    }
    return Layout.interactables().every(({ at }) =>
      Layout.distanceToHead(at, head) + 0.012 <= Layout.REACH && at[2] < head[2] && Placement.contains(polygon, at[0], at[2]));
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
