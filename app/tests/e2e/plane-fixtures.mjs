// Feed explicit geometry into Cyclone's plane-selection boundary, then let the
// running ECS perform placement. This is not evidence of native plane detection.
import { writeFileSync } from 'node:fs';
import { Driver } from './driver.mjs';
const d=new Driver(),results=[];
const cases=[
  {name:'large front table',width:1.4,depth:.8,yaw:0,head:[0,1.3,0],shift:0,expect:'plane'},
  {name:'large rotated table, different seat',width:1.4,depth:.8,yaw:.45,head:[.2,1.42,.1],shift:0,expect:'plane'},
  {name:'small nearby table',width:.36,depth:.2,yaw:0,head:[0,1.3,0],shift:0,expect:'plinth'},
  {name:'rotated insufficient depth',width:.64,depth:.42,yaw:.45,head:[0,1.3,0],shift:0,expect:'plinth'},
  {name:'side table beyond reach',width:1.4,depth:.8,yaw:0,head:[0,1.3,0],shift:1.6,expect:'plinth'},
  {name:'no plane',width:0,depth:0,yaw:0,head:[-.15,1.52,.12],shift:0,expect:'plinth'},
];
for(const test of cases){
  d.page(`location.search='?mode=handover&geometry=${encodeURIComponent(test.name)}'`);d.sleep(4000);
  d.page(`(async()=>{
    const {TwinSystem}=await import('/src/systems/twin.ts'),Group=window.cyclone.stage.root.constructor,t=${JSON.stringify(test)};
    const object=new Group();object.position.set(t.head[0]+t.shift,t.head[1]-.45,t.head[2]-.04);object.rotation.y=t.yaw;object.updateMatrixWorld(true);
    const plane={orientation:'horizontal',semanticLabel:'table',polygon:[[-t.width/2,0],[t.width/2,0],[t.width/2,-t.depth],[-t.width/2,-t.depth]].map(([x,z])=>({x,z}))};
    TwinSystem.prototype.bestPlane=()=>t.width?{entity:{object3D:object},plane}:null;
    window.cyclone.app.settings.set('passthrough',true);return true;
  })()`);
  d.cli(['xr','enter']);
  d.cli(['xr','set-transform'],{device:'headset',position:{x:test.head[0],y:test.head[1],z:test.head[2]}});
  d.cli(['xr','look-at'],{device:'headset',target:{x:test.head[0],y:test.head[1],z:test.head[2]-.5}});
  d.cli(['xr','set-input-mode'],{mode:'hand'});
  const s=d.waitFor('geometry placement',s=>s.anchor!=='pending'&&s.ready,10);
  const measured=d.page(`(async()=>{const c=window.cyclone,{Placement}=await import('/src/models/placement.ts');return {anchor:c.stage.anchor,position:c.stage.root.position.toArray(),head:c.stage.head.toArray(),polygon:c.stage.polygon,fits:Placement.fits(c.stage.polygon,c.stage.head.toArray()),plinth:c.stage.root.getObjectByName('plinth')?.visible}})()`);
  const ok=s.anchor===test.expect&&measured.fits;
  results.push({test,ok,measured});console.log(`${ok?'PASS':'FAIL'} ${test.name}: ${s.anchor}`);
}
writeFileSync(`${process.env.CYCLONE_EVIDENCE ?? '../docs/revision1'}/plane-fixtures.json`,JSON.stringify({at:new Date().toISOString(),source:'Running IWER/ECS placement with explicit mock plane geometry; native room detection remains H3',results},null,2));
process.exitCode=results.some(r=>!r.ok)?1:0;
