/**
 * Safety envelopes in twin-local metres (+x right, +y up, +z toward the user).
 * Boxes are zones a moving probe must not enter; limits are scalar ceilings.
 */
export type Vec3 = [number, number, number];

export type BoxZone = {
  id: string;
  label: string;
  kind: 'box';
  min: Vec3;
  max: Vec3;
  /** Floor marking style for the twin renderer. */
  marking?: 'walkway' | 'zone' | 'none';
};

export type LimitZone = {
  id: string;
  label: string;
  kind: 'limit';
  asset_id: string;
  max: number;
  unit: string;
};

export type Zone = BoxZone | LimitZone;

export type Probe = { center: Vec3; half: Vec3; scalar: number };

export class Envelope {
  constructor(readonly zones: Zone[]) {}

  static overlaps(probe: Probe, zone: BoxZone): boolean {
    for (let i = 0; i < 3; i++) {
      if (probe.center[i] + probe.half[i] < zone.min[i]) return false;
      if (probe.center[i] - probe.half[i] > zone.max[i]) return false;
    }
    return true;
  }

  /** First zone the probe violates among `ids` (null when clear). */
  breach(probe: Probe, ids: readonly string[]): Zone | null {
    for (const zone of this.zones) {
      if (!ids.includes(zone.id)) continue;
      if (zone.kind === 'box' && Envelope.overlaps(probe, zone)) return zone;
      if (zone.kind === 'limit' && probe.scalar > zone.max) return zone;
    }
    return null;
  }

  get(id: string): Zone | undefined {
    return this.zones.find((z) => z.id === id);
  }
}
