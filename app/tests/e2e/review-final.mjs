#!/usr/bin/env node
// Run after spatial.mjs; checks the final paged card using real hand-ray input.
import { writeFileSync } from 'node:fs';
import { Driver } from './driver.mjs';
const d=new Driver(true),results=[];
const check=(name,ok,detail='')=>{results.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)throw Error(name)};
const state=()=>d.page(`window.cyclone.stage.root.getObjectByName('inspection').userData`);
let s=d.probe();const arm=s.tokens.find(t=>t.tool==='set_arm_velocity'&&t.status==='held');
d.calibrate();d.leftRest=[s.head[0]-.25,s.head[1]-.3,s.head[2]-.1];d.rightRest=[s.head[0]+.25,s.head[1]-.3,s.head[2]-.1];d.park();d.lift('hand-right',[s.head[0]+.2,s.head[1]-.15,s.head[2]-.15]);
const at=d.point('inspection');d.look([s.head[0]+.15,s.head[1]-.25,s.head[2]-.5]);
const turned=d.point('inspection');
check('turning the head does not drag the open card',at.every((x,i)=>Math.abs(x-turned[i])<.0001));d.look(at);
for(let i=0;i<8&&state().page!=='rationale';i++){
  const p=state();d.click('card-controls',p.page==='tools'||p.pagination.total===1?'a':'c');
}
check('named full rationale opens at 125% text',state().page==='rationale'&&d.probe().settings.textScale===1.25);
const expected=d.page(`window.cyclone.app.shift.get(${JSON.stringify(arm.id)}).intent.rationale`);
let all='';const total=state().pagination.total;
for(let i=0;i<total;i++){
  const label=d.page(`window.cyclone.stage.root.getObjectByName('decision-card').userData.label`);
  check(`rationale page ${i+1}: loaded, scaled and unclipped`,label.fonts==='ready'&&label.textScale===1.25&&!label.overflow);
  all+=' '+label.rendered.map(r=>r.text).join(' ');
  if(i===0)d.shot('after-rationale-125');
  if(i+1<total)d.click('card-controls','b');
}
check('pagination retains the complete rationale',all.includes(expected.replace(/\s+/g,' ')));
d.click('card-controls','c');
d.page(`window.cyclone.app.shift.amend(${JSON.stringify(arm.id)},180)`);d.sleep(800);
const labels=d.page(`(()=>{const out=[],visible=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true};window.cyclone.stage.root.traverse(o=>{if(o.userData.label&&visible(o))out.push({name:o.name,...o.userData.label})});return out})()`);
check('all visible canvas labels use ready fonts without overflow',labels.every(l=>l.fonts==='ready'&&!l.overflow),labels);
writeFileSync(`${process.env.CYCLONE_EVIDENCE ?? '../docs'}/e2e-final-review.json`,JSON.stringify({at:new Date().toISOString(),source:'IWSDK IWER, actual hand-ray controls',results},null,2));
