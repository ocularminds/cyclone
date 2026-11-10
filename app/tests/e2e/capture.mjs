#!/usr/bin/env node
// C47: capture mode is deterministic, and the end card shows the session's seals with an empty tray and no HUD.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Driver } from './driver.mjs';

const d = new Driver(true);
const results=[];
const check=(name,ok,detail='')=>{results.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}`)};
const firstGlyph = () => {
  d.page(`location.search = '?capture=1'`);
  d.sleep(5000);
  d.cli(['xr', 'enter']);
  d.cli(['xr', 'set-input-mode'], { mode: 'hand' });
  return d.waitFor('first token', (x) => x.tokens.length > 0, 30).tokens[0].glyph;
};
const a = firstGlyph();
const b = firstGlyph();
check('capture mode is deterministic (same first intent hash across runs)',a===b,a);
check('capture captions start on',d.probe().settings.captions===true);
// decide the first shift's tokens programmatically, as a recorded session would have
d.page(`(async () => {
  const { app } = window.cyclone;
  const order = [['set_conveyor_speed','APPROVE','place'],['set_arm_velocity','APPROVE','two_hand_hold'],['set_oven_setpoint','REJECT','veto_push'],['lift_pallet','REJECT','veto_push']];
  for (const [tool, kind, gesture] of order) {
    let t;
    for (let i = 0; i < 200 && !(t = app.shift.waiting().find((x) => x.intent.tool === tool)); i++) await new Promise((r) => setTimeout(r, 100));
    if (tool === 'set_arm_velocity') await app.shift.amend(t.id, 180);
    await app.shift.decide(t.id, kind, gesture);
  }
  return app.ledger.own().length;
})()`);
d.page(`location.search = '?capture=endcard'`);
d.sleep(5000);
d.cli(['xr', 'enter']);
d.cli(['xr', 'set-input-mode'], { mode: 'hand' });
d.sleep(4000);
const s = d.probe();
const ok = s.seals.length >= 4 && s.tokens.length === 0;
check('end card has four seals and an empty holding tray',ok,{seals:s.seals.length,tokens:s.tokens.length});
const presentation=()=>d.page(`(()=>{const c=window.cyclone;const visible=o=>{if(!o)return false;for(;o;o=o.parent)if(!o.visible)return false;return true};return {ui:['cue-caption','feedback','shift-summary','inspection','receipt-detail','settings-panel'].map(name=>({name,visible:visible(c.stage.root.getObjectByName(name))})),rigs:[...c.stage.rigs].map(([id,r])=>{const poses=[];r.root.traverse(o=>poses.push({name:o.name,p:o.position.toArray(),q:o.quaternion.toArray()}));return {id,poses}}),ghosts:(()=>{const a=[];c.stage.root.traverse(o=>{if(o.name==='active-rehearsal-ghost'&&visible(o))a.push(o.name)});return a})()}})()`);
const before=presentation();d.sleep(1200);const after=presentation();
check('end card hides HUD, captions and rehearsal ghost',after.ui.every(x=>!x.visible)&&after.ghosts.length===0,after.ui);
check('end card machines remain idle',JSON.stringify(before.rigs)===JSON.stringify(after.rigs));
check('end card seals form an even row',s.seals.length===4&&s.seals.every((p,i)=>Math.abs(p[1]-s.seals[0][1])<.001&&Math.abs(p[2]-s.seals[0][2])<.001&&(i===0||Math.abs(p[0]-s.seals[i-1][0]-.032)<.001)),s.seals);
d.cli(['xr', 'animate-to'], { device: 'hand-right', position: { x: 0.6, y: 0.4, z: 0.6 }, duration: 0.2 });
d.cli(['xr', 'animate-to'], { device: 'hand-left', position: { x: -0.6, y: 0.4, z: 0.6 }, duration: 0.2 });
d.look([s.deskRoot[0],s.deskRoot[1]+.04,s.deskRoot[2]-.15]);
d.sleep(800);
execFileSync('npx', ['@iwsdk/cli', 'browser', 'screenshot', '--output-file', `${process.env.CYCLONE_EVIDENCE ?? '../docs/screens'}/endcard.png`]);
d.page(`location.search = ''`);
writeFileSync(`${process.env.CYCLONE_EVIDENCE ?? '../docs'}/e2e-capture.json`,JSON.stringify({at:new Date().toISOString(),source:'IWSDK IWER; capture data setup is programmatic',results},null,2));
process.exitCode=results.some(x=>!x.ok)?1:0;
