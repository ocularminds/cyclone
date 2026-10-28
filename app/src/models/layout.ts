export type XYZ = readonly [number, number, number];

/**
 * Desk-frame layout (metres). Origin: the desk's near edge in front of the
 * seated user; +x right, +y up (desk surface y = 0), +z toward the user.
 * Everything interactive sits within 0.61 m of the nominal seated head and
 * nothing is behind it (C21, BRIEF §6).
 */
export class Layout {
  /** Nominal seated eye position used by the reach check and the plinth fallback. */
  static readonly HEAD: XYZ = [0, 0.42, 0.28];
  static readonly REACH = 0.61;

  static readonly TWIN: XYZ = [0, 0, -0.31];
  static readonly TRAY: XYZ = [-0.1, 0, -0.06];
  static readonly TRAY_SLOTS = 4;
  static readonly TRAY_PITCH = 0.05;
  static readonly SLOT: XYZ = [0.05, 0, -0.06];
  static readonly PAD: XYZ = [0.135, 0, -0.06];
  static readonly RACK: XYZ = [0.215, 0, -0.095];
  static readonly CHUTE: XYZ = [0.27, 0, -0.012];
  static readonly LEDGER: XYZ = [-0.25, 0, -0.06];
  static readonly PUCK: XYZ = [-0.255, 0, -0.008];
  static readonly AGENT_Y = 0.11;
  static readonly AGENT_Z = -0.135;
  static readonly AGENT_X = [-0.11, 0, 0.11] as const;
  static readonly RULE: XYZ = [0, 0.07, -0.045];
  static readonly HUD: XYZ = [0, 0.2, -0.12];

  /** Fallback plinth footprint, desk frame (x from..to, z from..to). */
  static readonly PLINTH = { x: [-0.37, 0.37], z: [-0.57, 0], height: 0.04 } as const;
  /** Plinth top sits this far below the seated eye when no table is found (C20). */
  static readonly SEATED_DESK_DROP = 0.42;

  /** Station capture radii for place/drop detection. */
  static readonly SLOT_RADIUS = 0.035;
  static readonly PAD_RADIUS = 0.035;
  static readonly AGENT_RADIUS = 0.045;
  /** Token radius and height. */
  static readonly TOKEN_R = 0.017;
  static readonly TOKEN_H = 0.014;

  static traySpot(i: number): XYZ {
    const n = Layout.TRAY_SLOTS;
    const col = i % n;
    const row = Math.floor(i / n);
    const x = Layout.TRAY[0] + (col - (n - 1) / 2) * Layout.TRAY_PITCH;
    return [x, Layout.TOKEN_H / 2 + 0.006 + row * 0.016, Layout.TRAY[2] - row * 0.004];
  }

  static rackSpot(i: number): XYZ {
    return [Layout.RACK[0], 0.012 + (i % 4) * 0.016, Layout.RACK[2] + Math.floor(i / 4) * 0.035];
  }

  /** Ledger shelf grid: 3 tiers of 5 seals, newest at the front. */
  static sealSpot(i: number): XYZ {
    const perRow = 5;
    const tier = Math.floor(i / perRow) % 3;
    const col = i % perRow;
    return [Layout.LEDGER[0] - 0.036 + col * 0.018, 0.022 + tier * 0.034, Layout.LEDGER[2] - tier * 0.012];
  }

  static agentSpot(i: number): XYZ {
    return [Layout.AGENT_X[i % 3], Layout.AGENT_Y, Layout.AGENT_Z];
  }

  /** Every interactable's desk-frame position, for the reach/FoV geometry check (C21). */
  static interactables(): Array<{ name: string; at: XYZ }> {
    const out: Array<{ name: string; at: XYZ }> = [];
    for (let i = 0; i < Layout.TRAY_SLOTS * 2; i++) out.push({ name: `tray${i}`, at: Layout.traySpot(i) });
    out.push({ name: 'slot', at: Layout.SLOT }, { name: 'pad', at: Layout.PAD });
    out.push({ name: 'chute', at: Layout.CHUTE }, { name: 'puck', at: Layout.PUCK });
    for (let i = 0; i < 8; i++) out.push({ name: `rack${i}`, at: Layout.rackSpot(i) });
    for (let i = 0; i < 15; i++) out.push({ name: `seal${i}`, at: Layout.sealSpot(i) });
    for (let i = 0; i < 3; i++) out.push({ name: `agent${i}`, at: Layout.agentSpot(i) });
    out.push({ name: 'rule', at: Layout.RULE });
    return out;
  }

  static distanceToHead(at: XYZ, head: XYZ = Layout.HEAD): number {
    return Math.hypot(at[0] - head[0], at[1] - head[1], at[2] - head[2]);
  }
}
