#!/usr/bin/env node
// Checks the actual renderer draw order after the visual review found shelf occlusion.
// No screenshot preview is used: observe real draw callbacks and then exercise hand input.
import {writeFileSync} from 'node:fs';
import {Driver} from './driver.mjs';
const d=new Driver(true),results=[],draws=[];
const check=(name,ok,detail='')=>{results.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)throw Error(name)};
function drawn(name){
  const rows=d.page(`(()=>new Promise(resolve=>{const c=window.cyclone,saved=[],rows=[];c.stage.root.traverse(o=>{if(!o.isMesh)return;let root=o,ui=false;for(;root;root=root.parent)if(['inspection','receipt-detail','settings-panel','cue-caption','feedback','shift-summary'].includes(root.name))ui=true;const previous=o.onBeforeRender;saved.push([o,previous]);o.onBeforeRender=function(...args){previous.apply(this,args);const m=args[4];if(m.colorWrite!==false)rows.push({frame:c.world.renderer.info.render.frame,eye:args[2].uuid,ui,name:o.name,depthTest:m.depthTest,depthWrite:m.depthWrite,transparent:m.transparent,order:o.renderOrder})}});c.world.session.requestAnimationFrame(()=>c.world.session.requestAnimationFrame(()=>{for(const[o,previous]of saved)o.onBeforeRender=previous;resolve(rows)}))}))()`);
  draws.push({name,rows});
  // The renderer frame counter covers both eyes; each eye has its own ordered draw list.
  const frames=[...new Set(rows.map(r=>`${r.frame}:${r.eye}`))].map(key=>rows.filter(r=>`${r.frame}:${r.eye}`===key));
  const complete=frames.filter(frame=>frame.some(r=>r.ui)&&frame.some(r=>!r.ui));
  check(`${name}: actual reading draws ignore miniature depth`,complete.length>0&&complete.every(frame=>frame.filter(r=>r.ui).every(r=>!r.depthTest&&!r.depthWrite&&r.order>=1000)));
  check(`${name}: reading surfaces draw after miniature colour`,complete.every(frame=>frame.findIndex(r=>r.ui)>frame.findLastIndex(r=>!r.ui)),complete.map(frame=>({draws:frame.length,firstUi:frame.findIndex(r=>r.ui),lastMiniature:frame.findLastIndex(r=>!r.ui)})));
}
try{
 d.cli(['browser','run','tests/e2e/reset.mjs']);d.page(`location.search='?mode=onboarding'`);d.sleep(4500);d.cli(['xr','enter']);d.cli(['xr','set-input-mode'],{mode:'hand'});d.calibrate();
 let s=d.waitFor('conveyor',s=>s.tokens.some(t=>t.tool==='set_conveyor_speed'));
 d.leftRest=[s.head[0]-.25,s.head[1]-.3,s.head[2]-.1];d.rightRest=[s.head[0]+.25,s.head[1]-.3,s.head[2]-.1];d.park();
 let token=s.tokens.find(t=>t.tool==='set_conveyor_speed');d.look(token.at);d.waitFor('card',s=>s.focus===token.id);d.sleep(600);drawn('card');d.shot('after-card-unoccluded');
 s=d.probe();d.move('hand-right',[s.puck[0],s.puck[1]+.12,s.puck[2]]);d.move('hand-right',[s.puck[0],s.puck[1]+.01,s.puck[2]]);d.pinch('hand-right',1);d.pinch('hand-right',0);d.waitFor('settings',s=>s.settingsOpen);d.lift('hand-right',[s.head[0]+.2,s.head[1]-.15,s.head[2]-.15]);d.sleep(700);d.look(d.point('settings-panel'));
 check('puck opens settings home',d.page(`window.cyclone.stage.root.getObjectByName('settings-panel').userData.page`)==='home');
 d.click('settings-panel','action-b');check('layered settings still accepts hand-ray selection',d.page(`window.cyclone.stage.root.getObjectByName('settings-panel').userData.page`)==='display');
 drawn('settings');d.shot('after-settings-unoccluded');d.click('settings-panel','close');check('Close returns to the task',!d.probe().settingsOpen);d.park();
 s=d.probe();token=s.tokens.find(t=>t.tool==='set_conveyor_speed');d.carry(token.at,s.slot);s=d.waitFor('sealed',s=>s.ledger.length===1);check('physical grab and place still seals once',s.ledger[0].decision==='APPROVE');
 const at=s.seals[0];d.look(at);d.move('hand-right',[at[0],at[1]+.12,at[2]]);d.move('hand-right',[at[0],at[1]+.01,at[2]]);d.pinch('hand-right',1);d.waitFor('receipt',()=>d.page(`window.cyclone.stage.replayOpen`));d.pinch('hand-right',0);d.park();d.sleep(700);drawn('receipt');d.shot('after-receipt-unoccluded');
}finally{writeFileSync(`${process.env.CYCLONE_EVIDENCE??'../docs'}/occlusion.json`,JSON.stringify({at:new Date().toISOString(),source:'IWSDK IWER: actual onBeforeRender callbacks plus hand input',results,draws},null,2))}
