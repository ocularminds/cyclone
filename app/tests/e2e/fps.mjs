// Measures frames per second of the running page over ~2 s.
export default async function run({ frame }) {
  return frame.evaluate(() => new Promise((resolve) => {
    const s = window.cyclone.world.session;
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
      n++;
      if (performance.now() - t0 > 2000) resolve({ fps: (n * 1000) / (performance.now() - t0), xr: !!s });
      else if (s) s.requestAnimationFrame(tick);
      else requestAnimationFrame(tick);
    };
    if (s) s.requestAnimationFrame(tick);
    else requestAnimationFrame(tick);
  }));
}
