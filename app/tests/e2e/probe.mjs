// Dumps Cyclone's live state (world-space positions) for the emulator e2e driver.
export default async function run({ frame }) {
  return frame.evaluate(() => {
    const c = window.cyclone;
    if (!c) return { ready: false };
    const { app, stage } = c;
    const V = stage.root.position.constructor;
    const world = (obj) => {
      const v = new V();
      obj.getWorldPosition(v);
      return [v.x, v.y, v.z].map((n) => +n.toFixed(4));
    };
    const deskToWorld = (p) => {
      const v = new V(p[0], p[1], p[2]);
      stage.root.updateWorldMatrix(true, false);
      v.applyMatrix4(stage.root.matrixWorld);
      return [v.x, v.y, v.z].map((n) => +n.toFixed(4));
    };
    const byName = (n) => stage.root.getObjectByName(n);
    const tokens = [...stage.views.values()].map((v) => ({
      id: v.token.id,
      tool: v.token.intent.tool,
      requires: v.token.intent.policy.requires,
      status: v.token.status,
      place: v.place,
      value: v.token.value,
      breach: v.token.rehearsal.breach?.zone_id ?? null,
      glyph: v.token.glyph.key,
      at: world(v.object),
      hold: v.holdTime,
    }));
    const handle = byName('handle');
    const dial = byName('dial');
    return {
      ready: true,
      t: app.clock.seconds,
      paused: app.clock.isPaused,
      anchor: stage.anchor,
      focus: stage.focus,
      scrub: stage.scrub,
      holding: stage.holding,
      tokens,
      slot: deskToWorld([0.05, 0.02, -0.06]),
      pad: deskToWorld([0.135, 0.02, -0.06]),
      chute: deskToWorld([0.27, 0.0, -0.012]),
      offEdge: deskToWorld([0.3, 0.02, 0.08]),
      deskRoot: world(stage.root),
      head: deskToWorld([stage.head.x, stage.head.y, stage.head.z]),
      handle: handle ? world(handle) : null,
      handleVisible: handle?.visible ?? false,
      dial: dial ? world(dial) : null,
      ledger: app.ledger.own().map((r) => ({
        decision: r.decision.decision,
        gesture: r.decision.gesture,
        glyph: (r.amended_hash ?? r.intent_hash).slice(7, 23),
        amended_args: r.decision.amended_args ?? null,
      })),
      summary: app.log.summary(),
      beats: app.log.beats().map((b) => `${b.note}@${(b.t / 1000).toFixed(1)}`),
      settings: app.settings.snapshot(),
      calibration: app.calibration.label,
    };
  });
}
