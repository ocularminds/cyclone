// A second actual hand-driven take for receipt/history and settings footage.
import { Driver } from './driver.mjs';
const d=new Driver(),p=()=>d.page(`window.cyclone.stage.root.getObjectByName('receipt-detail').userData`);
d.page(`location.search='?capture=1'`);d.sleep(5000);
d.cli(['xr','enter']);d.cli(['xr','set-input-mode'],{mode:'hand'});d.calibrate();
let s=d.waitFor('first proposal',s=>s.tokens.some(t=>t.tool==='set_conveyor_speed'));
d.leftRest=[s.head[0]-.25,s.head[1]-.3,s.head[2]-.1];d.rightRest=[s.head[0]+.25,s.head[1]-.3,s.head[2]-.1];d.park();
const token=d.probe().tokens.find(t=>t.tool==='set_conveyor_speed');d.look(token.at);d.sleep(900);s=d.probe();
d.carry(s.tokens.find(t=>t.id===token.id).at,s.slot);d.waitFor('signed conveyor receipt',s=>s.ledger.length===1);d.park();
d.page(`window.cycloneCaptureName='details'`);d.cli(['browser','run','tests/e2e/video-start.mjs']);
const mark=name=>d.page(`window.cycloneRecording.events.push({seconds:(performance.now()-window.cycloneRecording.start)/1000,mark:${JSON.stringify(name)}})`);
s=d.probe();const at=s.seals[0];d.look(at);d.move('hand-right',[at[0],at[1]+.10,at[2]]);d.move('hand-right',[at[0],at[1]+.01,at[2]]);d.pinch('hand-right',1);
d.waitFor('receipt open',()=>d.page(`window.cyclone.stage.replayOpen`));d.pinch('hand-right',0);d.lift('hand-right',d.rightRest);mark('receipt-open');d.sleep(5000);
for(let i=0;i<12&&p().page!=='proof';i++){
  const page=p();d.click('receipt-controls',(page.page==='action'||page.page==='menu')&&page.pagination.total===1?'b':'c');
}
if(p().page!=='proof')throw Error('Proof page did not open');mark('demo-proof');d.sleep(6000);
for(let i=0;i<15&&d.page(`window.cyclone.stage.replayOpen`);i++)d.click('receipt-controls','c');
if(d.page(`window.cyclone.stage.replayOpen`))throw Error('Receipt did not close');
s=d.probe();d.look(s.puck);d.move('hand-right',[s.puck[0],s.puck[1]+.1,s.puck[2]]);d.move('hand-right',[s.puck[0],s.puck[1]+.01,s.puck[2]]);d.pinch('hand-right',1);d.pinch('hand-right',0);
d.waitFor('settings open',s=>s.settingsOpen);d.lift('hand-right',d.rightRest);
const action=id=>{const a=d.page(`window.cyclone.stage.root.getObjectByName('settings-panel').userData.actions`),i=a.findIndex(a=>a.id===id);if(i<0)throw Error('Missing settings action '+id);d.click('settings-panel',`action-${'abc'[i]}`)};
action('page:input');mark('input-controls');d.sleep(5000);
d.click('settings-panel','back');action('page:display');action('text');mark('larger-text');d.sleep(5000);
d.click('settings-panel','close');mark('settings-closed');d.sleep(1500);
d.cli(['browser','run','tests/e2e/video-stop.mjs']);console.log('PASS actual hands receipt and settings take recorded');
