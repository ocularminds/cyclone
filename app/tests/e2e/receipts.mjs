#!/usr/bin/env node
// Run after drive.mjs. Pickups and receipt controls use real immersive hand input.
// Changed-model, legacy and tampered records are explicit test data, not input evidence.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Driver } from './driver.mjs';
import { reviewBounds } from './bounds.mjs';

const out=process.env.CYCLONE_EVIDENCE ?? '../docs/design1';mkdirSync(out,{recursive:true});
const d=new Driver(true),results=[],bounds=[];
const check=(name,ok,detail='')=>{results.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)throw Error(name)};
const records=()=>d.page(`window.cyclone.app.ledger.own()`);
const page=()=>d.page(`window.cyclone.stage.root.getObjectByName('receipt-detail').userData`);
const text=()=>d.page(`window.cyclone.stage.root.getObjectByName('receipt-text').userData.label.rendered.map(r=>r.text).join(' ')`);
const path=()=>d.page(`(()=>{const c=window.cyclone,p=c.stage.root.getObjectByName('proposed-path-solid');return {active:c.stage.replay,visible:p.visible,samples:Array.from(p.geometry.attributes.position.array)}})()`);
const xyz=samples=>samples.filter((_,i)=>i%4<3);
let valid=[];

function enter() {
  d.sleep(3500);d.cli(['xr','enter']);d.cli(['xr','set-input-mode'],{mode:'hand'});d.calibrate();
  const s=d.waitFor('anchor',s=>s.ready&&s.anchor!=='pending');
  d.rightRest=[s.head[0]+.25,s.head[1]-.3,s.head[2]-.1];d.leftRest=[s.head[0]-.25,s.head[1]-.3,s.head[2]-.1];d.park();
}
function pick(index) {
  let s=d.probe(),at=s.seals[index];const id=records()[index].record_id;d.look(at);d.move('hand-right',[at[0],at[1]+.12,at[2]]);d.move('hand-right',[at[0],at[1]+.01,at[2]]);d.pinch('hand-right',1);
  d.waitFor('receipt opened',()=>d.page(`window.cyclone.stage.replayOpen`),8);
  check('pickup selects the intended receipt',page().recordId===id);
  d.pinch('hand-right',0);d.lift('hand-right',[s.head[0]+.2,s.head[1]-.15,s.head[2]-.15]);d.sleep(700);
}
function go(want) {
  for(let i=0;i<12;i++){
    const p=page();if(p.page===want)return;
    if(p.page==='action'||p.page==='menu')d.click('receipt-controls',p.pagination.total>1?'c':want==='history'?'a':'b');
    else if(p.page==='proof'&&p.pagination.total===1)d.click('receipt-controls',want==='history'?'b':'a');
    else d.click('receipt-controls','c');
  }
  throw Error(`Could not reach receipt ${want}`);
}
function close(){for(let i=0;i<12&&d.page(`window.cyclone.stage.replayOpen`);i++)d.click('receipt-controls','c');check('receipt Close returns to the desk',!d.page(`window.cyclone.stage.replayOpen`));}
function readPages(){let s=text();const p=page();if(p.page==='history')return s;for(let i=1;i<p.pagination.total;i++){d.click('receipt-controls','b');s+=' '+text();}return s;}

try{
  valid=records();check('first-shift receipts available for reload test',valid.length===4);
  const index=valid.findIndex(r=>r.tool==='set_arm_velocity'),saved=valid[index];
  check('arm receipt retains original and amended values',saved.rehearsal.snapshot.original.args.deg_s===250&&saved.rehearsal.snapshot.reviewed.args.deg_s===180);
  d.page(`location.search=''`);enter();
  check('completed first shift opens handover',d.page(`window.cyclone.app.boot.scenario`)==='handover');
  check('signed snapshots survive reload unchanged',JSON.stringify(records())===JSON.stringify(valid));
  check('demo signature verifies after reload',d.page(`window.cyclone.app.signer.verify(window.cyclone.app.ledger.own()[${index}])`)===true);

  // Simulate a later model revision. Historical replay must not consult this model.
  const changed=d.page(`(()=>{const a=window.cyclone.app,t=structuredClone(a.rehearsal.twin);const arm=t.assets.find(x=>x.id===${JSON.stringify(saved.asset_id)});arm.params.reach*=.5;arm.params.target+=15;a.rehearsal=new a.rehearsal.constructor(t);return Array.from(a.rehearsal.run(${JSON.stringify(saved.tool)},${JSON.stringify(saved.asset_id)},${JSON.stringify(saved.rehearsal.args)}).samples)})()`);
  check('model-revision fixture changes the current rehearsal',JSON.stringify(xyz(changed))!==JSON.stringify(xyz(saved.rehearsal.snapshot.reviewed.samples)));
  pick(index);
  for(const scale of [1,1.25]){
    d.page(`window.cyclone.app.settings.set('textScale',${scale})`);d.sleep(500);
    const b=reviewBounds(d,'receipt-detail','receipt-controls');bounds.push({scale,...b});
    check(`receipt ${scale}: actual bounds and loaded fonts`,b.visible&&b.measured.every(x=>x.reach<=.611&&x.horizontal<=20.1&&x.vertical<=15.1&&(!x.label||x.label.fonts==='ready'&&!x.label.overflow)));
    const cap=b.measured.find(x=>x.name==='receipt-caption').rect;
    check(`receipt ${scale}: caption is clear of text and hit targets`,b.measured.filter(x=>x.name!=='receipt-caption').every(x=>Math.abs(cap.y-x.rect.y)>=(cap.height+x.rect.height)/2-.0001));
  }
  d.shot('after-receipt-125');go('proof');const proof=readPages();
  check('receipt distinguishes a valid local demo signature',proof.includes('Demo signature: valid')&&proof.includes('not an official'));
  check('receipt states simulated execution separately',proof.includes('Execution is simulated'));
  d.shot('after-proof-125');go('history');
  d.click('receipt-controls','a');const original=path();
  check('Original replays retained samples after model change',original.visible&&original.active==='Stored original rehearsal'&&JSON.stringify(original.samples)===JSON.stringify(xyz(saved.rehearsal.snapshot.original.samples)),JSON.stringify({active:original.active,visible:original.visible,firstMismatch:original.samples.findIndex((x,i)=>x!==xyz(saved.rehearsal.snapshot.original.samples)[i])}));
  d.click('receipt-controls','b');const reviewed=path();
  check('Reviewed replays retained samples after model change',reviewed.visible&&reviewed.active==='Stored reviewed rehearsal'&&JSON.stringify(reviewed.samples)===JSON.stringify(xyz(saved.rehearsal.snapshot.reviewed.samples)));
  close();

  // Locally signed legacy record and an altered signature payload exercise actual unverified UI.
  d.page(`(async()=>{const a=window.cyclone.app,base=structuredClone(a.ledger.own()[${index}]);const legacy=structuredClone(base);legacy.record_id='test-legacy-history';delete legacy.rehearsal.snapshot;delete legacy.verification;a.ledger.add(await a.signer.sign(legacy));const bad=structuredClone(base);bad.record_id='test-tampered-history';bad.rehearsal.args.deg_s=181;a.ledger.add(bad);location.reload()})()`);enter();
  pick(valid.length);go('history');
  check('legacy receipt explicitly has no original evidence',text().includes('Original evidence unavailable'));
  d.click('receipt-controls','a');check('legacy replay does not silently recompute',!d.probe().replay);close();
  pick(valid.length+1);go('proof');const invalid=readPages();
  check('tampered record is visibly invalid, never verified',invalid.includes('Demo signature: invalid')&&!invalid.includes('Signature and action binding checked'));
  const stamps=d.page(`(()=>{const out=[];window.cyclone.stage.root.traverse(o=>{if(o.name==='seal')out.push(o.userData.proof)});return out})()`);
  check('tampered seal has unverified appearance',stamps[valid.length+1]==='unverified');close();
}finally{
  if(valid.length)d.page(`window.cyclone.app.store.write('ledger',${JSON.stringify(valid)})`);
  writeFileSync(`${out}/receipt-bounds.json`,JSON.stringify(bounds,null,2));
  writeFileSync(`${out}/e2e-receipts.json`,JSON.stringify({at:new Date().toISOString(),source:'IWSDK IWER, hand input; model/legacy/tamper fixtures are test setup',results},null,2));
}
console.log('ALL RECEIPT CHECKS PASS');
