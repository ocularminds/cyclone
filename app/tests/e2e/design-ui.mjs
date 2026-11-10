#!/usr/bin/env node
// System-driven UIKit, real IWER hand-ray clicks. State inspection is never the activation.
import { writeFileSync, mkdirSync } from 'node:fs';
import { Driver } from './driver.mjs';

const out = process.env.CYCLONE_EVIDENCE ?? '../docs/design1'; mkdirSync(out, { recursive: true });
const d = new Driver(true), results = [], bounds = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) throw Error(name); };
const uiState = () => d.page(`(()=>{const c=window.cyclone,p=c.stage.root.getObjectByName('settings-panel');return {open:c.stage.settingsOpen,page:p?.userData.page,settings:c.app.settings.snapshot(),actions:p?.userData.actions,ledger:c.app.ledger.own().length}})()`);
const point = (panel, id) => d.page(`(()=>{const p=window.cyclone.stage.root.getObjectByName(${JSON.stringify(panel)});const e=${id ? `p.requireElementById(${JSON.stringify(id)})` : 'p'};return e.getWorldPosition(new p.position.constructor()).toArray()})()`);
function click(panel, id) {
  const at = point(panel, id);
  d.cli(['xr','look-at'], { device:'hand-right', target:{x:at[0],y:at[1],z:at[2]} });
  d.sleep(350); d.cli(['xr','select'], {device:'hand-right',duration:0.2}); d.sleep(250);
}
function settingsAction(id) {
  const s=uiState(); const idx=s.actions?.findIndex(a=>a.id===id);
  if (id==='back'||id==='close') click('settings-panel',id);
  else { if(idx<0||idx===undefined) throw Error(`No ${id} on ${s.page}`); click('settings-panel',`action-${'abc'[idx]}`); }
  if(id.startsWith('page:')) check(`open ${id.slice(5)}`,uiState().page===id.slice(5));
}
function inspect(name, panel='settings-panel') {
  const e=d.cli(['ecs','find'],{namePattern:panel,limit:10}).entities.find(e=>e.name===panel) ?? d.cli(['ecs','find'],{namePattern:panel,limit:10}).entities[0];
  const info=d.cli(['ui','inspect'],{entityIndex:e.entityIndex,properties:['fontFamily','fontWeight','fontSize','color','backgroundColor','backgroundOpacity','borderColor','borderWidth','width','height','minWidth','lineHeight']});
  const measured=d.page(`(()=>{const c=window.cyclone,p=c.stage.root.getObjectByName(${JSON.stringify(panel)}),V=p.position.constructor,head=c.stage.head.clone().applyMatrix4(c.stage.root.matrixWorld),q=p.getWorldQuaternion(p.quaternion.clone()); const data=${JSON.stringify(info.elements)};
    const forward=c.stage.gaze.clone().transformDirection(c.stage.root.matrixWorld),right=new V().crossVectors(forward,new V(0,1,0)).normalize(),up=new V().crossVectors(right,forward).normalize();
    return data.filter(r=>r.state.displayed&&r.state.visible&&r.layout?.size).map(r=>{const el=p.requireElementById(r.id),pos=el.getWorldPosition(new V()),local=p.worldToLocal(pos.clone()),w=r.layout.size[0]/100,h=r.layout.size[1]/100;
      const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>new V(x*w/2,y*h/2,0).applyQuaternion(q).add(pos).sub(head));
      return {id:r.id,width:w,height:h,local:local.toArray(),inside:Math.abs(local.x)+w/2<=.141&&Math.abs(local.y)+h/2<=.131,reach:Math.max(...corners.map(v=>v.length())),horizontal:Math.max(...corners.map(v=>Math.abs(Math.atan2(v.dot(right),v.dot(forward))*180/Math.PI))),vertical:Math.max(...corners.map(v=>Math.abs(Math.atan2(v.dot(up),v.dot(forward))*180/Math.PI)))};})})()`);
  bounds.push({name,info,measured});
  const targets=measured.filter(x=>x.id.startsWith('action-')||['back','close'].includes(x.id));
  check(`${name}: mounted controls contained and reachable`,targets.every(x=>x.inside&&x.reach<=.611&&x.height>=.0319),JSON.stringify(targets.map(x=>({id:x.id,width:x.width,reach:+x.reach.toFixed(3)}))));
  check(`${name}: central FoV`,targets.every(x=>x.horizontal<=20.1&&x.vertical<=15.1));
  check(`${name}: no clipped visible elements`,info.elements.every(e=>!e.state.visible||!e.state.displayed||!e.state.clipped));
}
function openSettings() {
  const s=d.probe(); d.move('hand-right',[s.puck[0],s.puck[1]+.12,s.puck[2]]); d.move('hand-right',[s.puck[0],s.puck[1]+.01,s.puck[2]]); d.pinch('hand-right',1); d.pinch('hand-right',0);
  d.waitFor('settings',s=>s.settingsOpen); d.lift('hand-right',rayRest); d.sleep(700);
  d.look(point('settings-panel')); check('puck opens home without activating a setting',uiState().page==='home');
}

let rayRest;
try {
  d.cli(['browser','run','tests/e2e/reset.mjs']);d.page(`location.search='?mode=onboarding&capture=1'`);d.sleep(3500);
  d.cli(['xr','enter']);d.cli(['xr','set-input-mode'],{mode:'hand'});d.calibrate();
  let s=d.waitFor('anchor',s=>s.ready&&s.anchor!=='pending');
  d.leftRest=[s.head[0]-.25,s.head[1]-.3,s.head[2]-.1];d.rightRest=[s.head[0]+.25,s.head[1]-.3,s.head[2]-.1];
  rayRest=[s.head[0]+.2,s.head[1]-.15,s.head[2]-.15];d.park();
  s=d.waitFor('first token',s=>s.tokens.some(t=>t.tool==='set_conveyor_speed'&&t.place==='tray'));
  let token=s.tokens.find(t=>t.tool==='set_conveyor_speed');d.look(token.at);d.sleep(500);
  d.shot('after-card');s=d.probe();token=s.tokens.find(t=>t.id===token.id);d.carry(token.at,s.slot);
  d.waitFor('first receipt',s=>s.ledger.length===1);d.park();d.shot('after-ledger-shelf');
  openSettings(); inspect('home-100');
  for(const scale of [1,1.25]) {
    if(scale===1.25){settingsAction('page:display');settingsAction('text');check('125% text setting applies',uiState().settings.textScale===1.25);settingsAction('back');}
    inspect(`home-${scale}`);
    settingsAction('page:input');inspect(`input-${scale}`);settingsAction('gaze');check('Gaze + pinch selected',uiState().settings.eyesOnly);
    settingsAction('onehand');inspect(`hand-${scale}`);settingsAction('left');check('preferred left hand selected',uiState().settings.preferredHand==='left');settingsAction('right');settingsAction('back');settingsAction('hands');settingsAction('back');
    settingsAction('page:display');inspect(`display-${scale}`);settingsAction('theme');check('theme changes to Porcelain',uiState().settings.theme==='porcelain');settingsAction('theme');
    settingsAction('page:comfort');inspect(`comfort-${scale}`);settingsAction('highContrast');inspect(`high-contrast-${scale}`);if(scale===1.25)d.shot('after-settings-125-hc');settingsAction('highContrast');
    settingsAction('captions');check('captions toggle off',!uiState().settings.captions);settingsAction('captions');settingsAction('reducedMotion');check('reduced motion on',uiState().settings.reducedMotion);settingsAction('reducedMotion');settingsAction('back');settingsAction('back');
    settingsAction('page:session');inspect(`session-${scale}`);settingsAction('passthrough');check('fallback surface selected',!uiState().settings.passthrough);settingsAction('passthrough');
    settingsAction('page:restart');inspect(`restart-${scale}`);settingsAction('cancel');check('restart cancellation preserves receipt',uiState().ledger===1);
    settingsAction('page:advanced');inspect(`advanced-${scale}`);settingsAction('amend');check('counter-offer mode active',!uiState().settings.amendedApproval);settingsAction('amend');settingsAction('mode');check('unavailable live keeps demo',uiState().settings.mode==='demo');
    settingsAction('page:rules');inspect(`rules-${scale}`);settingsAction('page:reset');inspect(`reset-${scale}`);settingsAction('cancel');check('reset cancellation preserves receipt and text size',uiState().ledger===1&&uiState().settings.textScale===scale);
    // Cancel returns to Advanced; Back returns to Session, then Home.
    settingsAction('back');settingsAction('back');
  }
  d.shot('after-settings');settingsAction('page:input');settingsAction('gaze');settingsAction('back');settingsAction('close');check('Close returns to the task',!uiState().open);
  s=d.waitFor('arm',s=>s.tokens.some(t=>t.tool==='set_arm_velocity'&&t.status==='held'));token=s.tokens.find(t=>t.tool==='set_arm_velocity');d.look(token.at);d.lift('hand-right',rayRest);d.waitFor('arm is inspected after the conveyor leaves',s=>s.focus===token.id);d.sleep(700);
  if(d.page(`window.cyclone.stage.root.getObjectByName('inspection').userData.pagination?.total>1`)) click('card-controls','c');
  click('card-controls','a');check('named full-rationale disclosure works for the arm',d.page(`(()=>{const c=window.cyclone;return c.stage.detail&&c.stage.focus===${JSON.stringify(token.id)}&&c.stage.root.getObjectByName('inspection').visible})()`)===true);d.shot('after-rationale-125');
  const labels=d.page(`(()=>{const out=[];window.cyclone.stage.root.traverse(o=>{if(o.userData.label)out.push({name:o.name,...o.userData.label})});return out})()`);writeFileSync(`${out}/font-and-labels.json`,JSON.stringify(labels,null,2));
  const signature=d.page(`(()=>{const c=window.cyclone;return c.app.signer.verify(c.app.ledger.own()[0])})()`);check('recorded demo signature verifies',signature===true);
  // A deliberate reset uses the same physical menu path and is the final destructive demo-only test.
  openSettings();settingsAction('page:session');settingsAction('page:advanced');settingsAction('page:rules');settingsAction('page:reset');settingsAction('confirm-reset');d.sleep(3000);
  const reset=d.page(`(()=>{const a=window.cyclone.app;return {seals:a.ledger.own().length,scale:a.settings.get('textScale'),complete:a.firstShift.completed}})()`);
  check('confirmed reset clears local receipts, preferences and completion',reset.seals===0&&reset.scale===1&&!reset.complete);
} finally {
  writeFileSync(`${out}/settings-bounds.json`,JSON.stringify(bounds,null,2));
  writeFileSync(`${out}/e2e-design-ui.json`,JSON.stringify({at:new Date().toISOString(),source:'IWSDK IWER immersive hand input',results},null,2));
}
console.log('ALL DESIGN UI CHECKS PASS');
