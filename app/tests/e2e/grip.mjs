// Reports both hands' grip-space world positions (emulator calibration for the e2e driver).
export default async function run({ frame }) {
  return frame.evaluate(() => {
    const { world } = window.cyclone;
    const V = world.scene.position.constructor;
    const out = {};
    for (const h of ['left', 'right']) {
      const g = new V();
      world.player.gripSpaces[h].getWorldPosition(g);
      out[h] = [g.x, g.y, g.z];
    }
    return out;
  });
}
