// Emulator-only sample. Does not establish Quest frame timing or thermal behavior.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export default async function run({frame,workspaceRoot}){
  const result=await frame.evaluate(()=>new Promise(resolve=>{
    const c=window.cyclone,session=c.world.session,frames=[];let previous=0;const start=performance.now();
    const tick=time=>{
      if(previous)frames.push({ms:time-previous,...c.world.renderer.info.render});previous=time;
      if(performance.now()-start<8000){session.requestAnimationFrame(tick);return;}
      const times=frames.map(f=>f.ms).sort((a,b)=>a-b),ghosts=[];
      c.stage.root.traverse(o=>{if(o.name==='active-rehearsal-ghost'&&o.visible)ghosts.push(o.name)});
      resolve({source:'IWSDK IWER on desktop Chromium; no hardware FPS claim',at:new Date().toISOString(),userAgent:navigator.userAgent,xr:!!session,frames:frames.length,durationMs:performance.now()-start,fps:1000/(times.reduce((a,b)=>a+b,0)/times.length),medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],maxTriangles:Math.max(...frames.map(f=>f.triangles)),maxDrawCalls:Math.max(...frames.map(f=>f.calls)),activeGhosts:ghosts.length,settings:c.app.settings.snapshot(),tokens:c.stage.views.size,records:c.app.ledger.all().length});
    };
    if(!session)throw Error('Enter XR before profiling');session.requestAnimationFrame(tick);
  }));
  writeFileSync(resolve(workspaceRoot,process.env.CYCLONE_EVIDENCE ?? '../docs/revision1','performance.json'),JSON.stringify(result,null,2));
  if(result.maxTriangles>60000||result.activeGhosts>1)throw Error('Rendering budget exceeded');
  return result;
}
