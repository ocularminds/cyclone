// Run after a capture first shift. Only real IWER hand input activates receipt/settings controls.
// The live receipt is a labelled UI fixture; no live authority is claimed.
import { writeFileSync } from 'node:fs';
import { Driver } from './driver.mjs';
import { reviewBounds } from './bounds.mjs';
const out=process.env.CYCLONE_EVIDENCE ?? '../docs/revision1',d=new Driver(true),results=[],bounds=[];
const check=(name,ok,detail='')=>{results.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)throw Error(name)};
const page=()=>d.page(`window.cyclone.stage.root.getObjectByName('receipt-detail').userData`);
const details=()=>d.page(`window.cyclone.stage.root.getObjectByName('receipt-text').userData.label.rendered.map(x=>x.text).join(' ')`);
const records=d.page(`window.cyclone.app.ledger.own()`);
check('completed capture provides current proof exports',records.length===4&&records.every(r=>r.dossier?.integrity.proof_bundle.version==='2.0'));
d.calibrate();let s=d.probe();const head=[...s.head];
d.leftRest=[head[0]-.25,head[1]-.3,head[2]-.1];d.rightRest=[head[0]+.25,head[1]-.3,head[2]-.1];d.park();
function pick(index){const s=d.probe(),p=s.seals[index];d.look(p);d.move('hand-right',[p[0],p[1]+.1,p[2]]);d.move('hand-right',[p[0],p[1]+.01,p[2]]);d.pinch('hand-right',1);d.waitFor('receipt',()=>d.page(`window.cyclone.stage.replayOpen`));d.pinch('hand-right',0);d.lift('hand-right',[head[0]+.2,head[1]-.15,head[2]-.15]);d.sleep(700);}
function go(want){for(let i=0;i<12&&page().page!==want;i++){const p=page();d.click('receipt-controls',(p.page==='action'||p.page==='menu')&&p.pagination.total===1?(want==='proof'?'b':'a'):'c');}check(`receipt ${want} reached`,page().page===want);}
function close(){for(let i=0;i<12&&d.probe().replay;i++)d.click('receipt-controls','c');for(let i=0;i<12&&d.page(`window.cyclone.stage.replayOpen`);i++)d.click('receipt-controls','c');check('receipt closes',!d.page(`window.cyclone.stage.replayOpen`));}
function position(offset){d.cli(['xr','set-transform'],{device:'headset',position:{x:head[0]+offset[0],y:head[1]+offset[1],z:head[2]+offset[2]}});d.sleep(700);}
try {
  pick(1);go('proof');
  d.page(`(()=>{const create=URL.createObjectURL;window.cycloneExport=null;URL.createObjectURL=function(blob){if(blob.type==='application/json')blob.text().then(s=>window.cycloneExport=JSON.parse(s));return create.call(this,blob)};return true})()`);
  d.click('receipt-controls','a');d.waitFor('public proof export',()=>d.page(`!!window.cycloneExport`));
  check('hand-selected Export proof contains public keys only',d.page(`(()=>{const p=window.cycloneExport;return p.keys.every(k=>!k.d&&k.kty==='OKP')&&p.source.includes('demo signature')})()`));
  d.cli(['browser','run','tests/e2e/save-export.mjs']);
  d.page(`window.cyclone.app.settings.set('textScale',1.25)`);
  for(const offset of [[.1,0,0],[0,.08,0],[0,0,.09],[-.1,0,0]]){
    position(offset);const b=reviewBounds(d,'receipt-detail','receipt-controls');bounds.push({offset,...b});
    check(`receipt translated ${offset}: actual corners reachable and visible`,b.measured.every(x=>x.reach<=.611&&x.horizontal<=20.1&&x.vertical<=15.1));
  }
  d.shot('receipt-translated');position([0,0,0]);close();
  d.page(`(()=>{const a=window.cyclone.app,r=structuredClone(a.ledger.own()[0]);r.record_id='revision-live-ui-fixture';r.intent_id=r.decision.intent_id='revision-live-ui-intent';r.source='live';r.revision=1;r.authorization={status:'approved',source:'policy_gate'};r.execution={eligible:false,status:'not_requested',reason:'UI fixture; no execution'};r.verification={verified:false,required_artifact_coverage_verified:false,trust_anchor:'UNKNOWN',issuer_tier:'unknown',assurance_scope_summary:'UI fixture: proof is unavailable.',checked_at:new Date().toISOString(),proof_status:'unverified',intent_binding_verified:false};delete r.dossier;window.cycloneRetryCount=0;window.cycloneDecisionCount=0;const decide=a.gate.resolve.bind(a.gate);a.gate.resolve=(...args)=>{window.cycloneDecisionCount++;return decide(...args)};a.gate.recover=async(id)=>{if(id!==r.intent_id)throw Error('Wrong record');window.cycloneRetryCount++;return {...r,revision:2}};a.ledger.add(r);a.shift.events.emit('record',r);return true})()`);
  d.sleep(1000);pick(4);go('proof');
  check('unverified live proof is explicitly separate from approval',details().includes('Record could not be verified')&&details().includes('Authorization: approved'));
  d.click('receipt-controls','a');d.sleep(700);
  check('Retry check retrieves the same receipt without approving',d.page(`window.cycloneRetryCount===1&&window.cycloneDecisionCount===0&&window.cyclone.app.ledger.own().filter(r=>r.record_id==='revision-live-ui-fixture').length===1&&window.cyclone.app.ledger.own().find(r=>r.record_id==='revision-live-ui-fixture').revision===2`));
  check('proof retry never turns on an execution result',d.page(`window.cyclone.app.ledger.own().find(r=>r.record_id==='revision-live-ui-fixture').execution.status==='not_requested'`));
  d.shot('live-receipt-retry');close();
  s=d.probe();d.look(s.puck);d.move('hand-right',[s.puck[0],s.puck[1]+.1,s.puck[2]]);d.move('hand-right',[s.puck[0],s.puck[1]+.01,s.puck[2]]);d.pinch('hand-right',1);d.pinch('hand-right',0);d.waitFor('settings',s=>s.settingsOpen);d.lift('hand-right',d.rightRest);d.sleep(700);
  for(const offset of [[.1,0,0],[0,.08,0],[0,0,.09]]){
    position(offset);
    const m=d.page(`(()=>{const c=window.cyclone,p=c.stage.root.getObjectByName('settings-panel'),V=p.position.constructor,head=c.stage.head.clone(),forward=c.stage.gaze.clone(),right=new V().crossVectors(forward,new V(0,1,0)).normalize(),up=new V().crossVectors(right,forward).normalize();return [-1,1].flatMap(x=>[-1,1].map(y=>{const v=new V(x*.14,y*.13,0).applyQuaternion(p.quaternion).add(p.position).sub(head);return {reach:v.length(),h:Math.abs(Math.atan2(v.dot(right),v.dot(forward))*180/Math.PI),v:Math.abs(Math.atan2(v.dot(up),v.dot(forward))*180/Math.PI)}}))})()`);
    bounds.push({settings:true,offset,corners:m});check(`settings translated ${offset}: whole panel fits`,m.every(x=>x.reach<=.611&&x.h<=20.1&&x.v<=15.1));
  }
  d.shot('settings-translated');position([0,0,0]);d.click('settings-panel','close');check('translated settings Close returns to task',!d.probe().settingsOpen);
} finally {
  d.page(`window.cyclone.app.store.write('ledger',${JSON.stringify(records)})`);
  writeFileSync(`${out}/revision-ui.json`,JSON.stringify({at:new Date().toISOString(),source:'Actual IWER hand input; live retry is a UI fixture with no service authorization',results,bounds},null,2));
}
