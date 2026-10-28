import { createSystem } from '@iwsdk/core';
import type { Cyclone } from '../app';
import { Layout } from '../models/layout';

/**
 * DrillSystem (C16): borrowed from baggage screening. A drill is never
 * labelled before the decision; afterwards Cyclone reveals it — and on a miss
 * the ghost replays the clip that was there to be found. Calibration score =
 * catch rate, persisted across sessions.
 */
export class DrillSystem extends createSystem({}) {
  private app!: Cyclone;

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.cleanupFuncs.push(
      this.app.shift.events.on('drill', ({ token, caught }) => {
        const score = this.app.calibration.label;
        if (caught) {
          this.app.cue('drill', `Drill — you caught it. Calibration: ${score}`, [...Layout.HUD]);
          this.app.bus.emit('toast', { text: `Drill — you caught it. Calibration ${score}.`, tone: 'good' });
          return;
        }
        this.app.cue('drill', `Drill — you missed it. Watch the replay. Calibration: ${score}`, [...Layout.HUD], 3);
        this.app.bus.emit('toast', { text: `Drill — you missed it. Calibration ${score}.`, tone: 'warn' });
        const i = token.intent;
        const r = token.rehearsal;
        this.app.bus.emit('replay', {
          tool: i.tool,
          asset_id: i.target.asset_id,
          args: token.args,
          label: r.breach ? `Drill replay: clips ${r.breach.zone_label}` : 'Drill replay',
        });
      }),
    );
  }
}
