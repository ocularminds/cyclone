#!/usr/bin/env node
// Actual mesh bounds in an immersive session. Data setup creates a busy handover;
// drive/extras separately prove the physical input paths.
import { writeFileSync } from 'node:fs';
import { Driver } from './driver.mjs';
const d=new Driver(true),results=[],samples=[];
const check=(name,ok,detail='')=>{results.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` — ${JSON.stringify(detail)}`:''}`)};
d.cli(['browser','run','tests/e2e/reset.mjs']);
d.page(`location.search='?mode=handover'`);d.sleep(5000);
d.cli(['xr','enter']);d.cli(['xr','set-input-mode'],{mode:'hand'});d.sleep(2500);
d.calibrate();let s=d.probe();d.leftRest=[s.head[0]-.25,s.head[1]-.3,s.head[2]-.1];d.rightRest=[s.head[0]+.25,s.head[1]-.3,s.head[2]-.1];d.park();
d.page(`(async()=>{const a=window.cyclone.app;for(const tool of ['set_conveyor_speed','set_conveyor_speed','lift_pallet']){let t;for(let i=0;i<200&&!(t=a.shift.waiting().find(t=>t.intent.tool===tool));i++)await new Promise(r=>setTimeout(r,100));if(!t||!await a.shift.decide(t.id,'APPROVE','place'))throw Error('Handover fixture did not resolve: '+tool)}return true})()`);
s=d.waitFor('offered rule and arm',s=>s.rules.length===1&&s.tokens.some(t=>t.tool==='set_arm_velocity'&&t.status==='held'));
const arm=s.tokens.find(t=>t.tool==='set_arm_velocity'&&t.status==='held');d.look(arm.at);d.waitFor('arm controls',s=>s.focus===arm.id&&s.handleVisible);d.sleep(1600);
for(const scale of [1,1.25]){
  d.page(`window.cyclone.app.settings.set('textScale',${scale})`);d.sleep(700);
  const measurement=d.page(`(()=>{const c=window.cyclone,V=c.stage.root.position.constructor;c.stage.root.updateWorldMatrix(true,true);const head=c.stage.head.clone().applyMatrix4(c.stage.root.matrixWorld),front=new V(0,0,-1).transformDirection(c.stage.root.matrixWorld);const visible=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true};const rows=[];c.stage.root.traverse(root=>{if(!visible(root)||!(['token','handle','dial','seal','puck','rule','slot','pad','chute'].includes(root.name)||root.name.startsWith('agent:')))return;let reach=0,depth=Infinity;const labels=[];root.traverse(o=>{if(!visible(o)||!o.geometry?.attributes.position)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=new V().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).sub(head);reach=Math.max(reach,p.length());depth=Math.min(depth,p.dot(front))}if(o.userData.label)labels.push(o.userData.label)});rows.push({name:root.name,position:root.getWorldPosition(new V()).toArray(),reach,depth,labels})});return {head:head.toArray(),rows}})()`);
  samples.push({scale,...measurement});
  check(`physical controls ${scale}: visible meshes remain within 0.61 m`,measurement.rows.length>=10&&measurement.rows.every(x=>x.reach<=.610001),measurement.rows.map(x=>({name:x.name,reach:x.reach})));
  check(`physical controls ${scale}: nothing behind the seated head`,measurement.rows.every(x=>x.depth>=0));
  check(`dial and offered rule ${scale}: values and bounds fit`,measurement.rows.filter(x=>['dial','rule'].includes(x.name)||x.name.startsWith('agent:')).every(x=>x.labels.length>0&&x.labels.every(l=>!l.overflow&&l.fonts==='ready'&&l.textScale===scale)),measurement.rows.filter(x=>['dial','rule'].includes(x.name)).map(x=>({name:x.name,labels:x.labels})));
}
d.shot('after-spatial-125');
writeFileSync(`${process.env.CYCLONE_EVIDENCE ?? '../docs'}/spatial-bounds.json`,JSON.stringify({at:new Date().toISOString(),source:'IWSDK IWER, actual mesh vertices; scenario fixtures for busy handover',results,samples},null,2));
process.exitCode=results.some(x=>!x.ok)?1:0;
