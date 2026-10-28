// Shared IWSDK-CLI driver for Cyclone's emulator e2e scripts (hands only).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export class Driver {
  constructor(shots = false) {
    this.shots = shots;
  }

  cli(args, input) {
    const argv = ['iwsdk', ...args];
    if (input) argv.push('--input-json', JSON.stringify(input));
    const out = execFileSync('npx', argv, { encoding: 'utf8', timeout: 120000 });
    const json = JSON.parse(out);
    if (!json.ok) throw new Error(`${args.join(' ')} failed: ${JSON.stringify(json.error)}`);
    return json.data?.result ?? json.data;
  }
  /** Evaluate a JS expression string in the page (state setup the user would do by hand elsewhere). */
  page(js) {
    writeFileSync('tests/e2e/.cmd.json', JSON.stringify({ js }));
    return this.cli(['browser', 'run', 'tests/e2e/eval.mjs']);
  }
  probe() {
    return this.cli(['browser', 'run', 'tests/e2e/probe.mjs']);
  }
  sleep(ms) {
    execFileSync('sleep', [String(ms / 1000)]);
  }
  waitFor(label, pred, timeoutS = 40) {
    const t0 = Date.now();
    for (;;) {
      const s = this.probe();
      if (pred(s)) return s;
      if (Date.now() - t0 > timeoutS * 1000) throw new Error(`timeout waiting for ${label}`);
      this.sleep(500);
    }
  }
  /** Grip offset from the emulated hand origin, per hand (a palm-down reach). */
  calibrate() {
    this.offset = {};
    for (const [device, side, p] of [['hand-left', 'left', [-0.1, 1.3, -0.3]], ['hand-right', 'right', [0.1, 1.3, -0.3]]]) {
      this.cli(['xr', 'animate-to'], { device, position: { x: p[0], y: p[1], z: p[2] }, orientation: { pitch: -70, yaw: 0, roll: 0 }, duration: 0.2 });
      this.sleep(500);
      const g = this.cli(['browser', 'run', 'tests/e2e/grip.mjs'])[side];
      this.offset[device] = [g[0] - p[0], g[1] - p[1], g[2] - p[2]];
    }
  }
  /** Move a hand so its grip (palm) arrives at `p`. */
  move(device, p, duration = 0.4) {
    const o = this.offset?.[device] ?? [0, 0, 0];
    const orientation = device.startsWith('hand') ? { pitch: -70, yaw: 0, roll: 0 } : undefined;
    this.cli(['xr', 'animate-to'], { device, position: { x: p[0] - o[0], y: p[1] - o[1], z: p[2] - o[2] }, orientation, duration });
    this.sleep(duration * 1000 + 250);
  }
  pinch(device, value) {
    this.cli(['xr', 'set-select-value'], { device, value });
    this.sleep(250);
  }
  look(p) {
    this.cli(['xr', 'look-at'], { device: 'headset', target: { x: p[0], y: p[1], z: p[2] } });
    this.sleep(600);
  }
  shot(name) {
    if (this.shots) execFileSync('npx', ['iwsdk', 'browser', 'screenshot', '--output-file', `../docs/screens/${name}.png`]);
  }
  /** Pinch-grab the thing at `from`, carry it slowly so it lands on `to`, release. (The emulator reports a lagging mid-grab pose; the release pose is exact.) */
  carry(from, to, hand = 'hand-right', id = null) {
    const start = [from[0], from[1] + 0.01, from[2]];
    this.move(hand, start);
    this.pinch(hand, 1);
    let h = [start[0] + to[0] - from[0], start[1] + to[1] - from[1], start[2] + to[2] - from[2]];
    this.move(hand, h, 1.5);
    this.pinch(hand, 0);
    this.move(hand, [h[0] + 0.15, h[1] + 0.2, h[2] + 0.15]);
  }
  /** Both palms onto a point in one atomic device update (quaternion for pitch -70°). */
  palms(at) {
    const q = { x: Math.sin((-70 * Math.PI) / 360), y: 0, z: 0, w: Math.cos((-70 * Math.PI) / 360) };
    const pos = (device, dx) => {
      const o = this.offset[device];
      return { x: at[0] + dx - o[0], y: at[1] + 0.01 - o[1], z: at[2] - o[2] };
    };
    this.cli(['xr', 'set-device-state'], {
      state: { hands: { left: { position: pos('hand-left', -0.03), orientation: q }, right: { position: pos('hand-right', 0.03), orientation: q } } },
    });
  }
  /** Lift one hand clear instantly (no animation). */
  lift(device, p) {
    const o = this.offset[device];
    this.cli(['xr', 'set-transform'], { device, position: { x: p[0] - o[0], y: p[1] - o[1], z: p[2] - o[2] } });
  }
  park() {
    this.move('hand-left', this.leftRest);
    this.move('hand-right', this.rightRest);
  }
}
