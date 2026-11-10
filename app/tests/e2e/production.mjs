// Run via the managed `browser run` tool after building and serving dist under /cyclone/.
// This checks production assets and decision/data flow; immersive gesture proof is in drive/extras.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default async function run({ browser, workspaceRoot }) {
  const base=process.env.CYCLONE_PRODUCTION_URL ?? 'https://127.0.0.1:4177/cyclone/';
  const isolated=await browser.newContext({ignoreHTTPSErrors:true});
  const page=await isolated.newPage();
  const blocked=[],requests=[],failed=[],errors=[],responses=[];
  const allowedStatic=new Set([
    'https://www.unpkg.com/@iwer/sem@2.5.0/captures/living_room.json',
    'https://unpkg.com/@iwer/sem@2.5.0/captures/living_room.json',
    'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/meta-quest-touch-plus/left.glb',
    'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/meta-quest-touch-plus/right.glb',
  ]);
  page.on('request',r=>requests.push(r.url()));
  page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
  page.on('response',r=>responses.push({url:r.url(),status:r.status()}));
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===new URL(base).origin||['data:','blob:'].includes(url.protocol)||allowedStatic.has(url.href))return route.continue();
    blocked.push(url.href);return route.abort();
  });
  const result={source:'Production build, clean isolated Chromium context; only observed SDK static room/input assets allowed remotely, service traffic blocked; programmatic decision flow',allowedStatic:[...allowedStatic],browserVersion:browser.version(),url:base,checks:[]};
  const check=(name,ok,detail)=>{result.checks.push({name,ok,detail});if(!ok)throw Error(name)};
  try {
    const coldStart=Date.now();
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.cyclone,undefined,{timeout:30000});
    result.entryReadyMs=Date.now()-coldStart;
    check('production entry is ready for XR',await page.locator('#enter').isEnabled());
    await page.locator('#enter').click();
    await page.waitForFunction(()=>!!window.cyclone.world.session,undefined,{timeout:15000});
    await page.waitForFunction(()=>window.cyclone.app.shift.waiting().length>0,undefined,{timeout:20000});
    const first=await page.evaluate(()=>({time:window.cyclone.app.clock.seconds,mode:window.cyclone.app.gate.capabilities.source}));
    result.coldFirstTokenMs=Date.now()-coldStart;
    check('default demo arrives within 15 seconds',first.mode==='demo'&&first.time<=15,first);
    for(const [tool,decision,gesture] of [['set_conveyor_speed','APPROVE','place'],['set_arm_velocity','APPROVE','two_hand_hold'],['set_oven_setpoint','REJECT','veto_push'],['lift_pallet','REJECT','veto_push']]) {
      await page.waitForFunction(t=>window.cyclone.app.shift.waiting().some(x=>x.intent.tool===t),tool,{timeout:15000});
      const record=await page.evaluate(async([tool,decision,gesture])=>{
        const a=window.cyclone.app,t=a.shift.waiting().find(x=>x.intent.tool===tool);
        if(tool==='set_arm_velocity')await a.shift.amend(t.id,180);
        const r=await a.shift.decide(t.id,decision,gesture);
        return r?{decision:r.decision.decision,verified:await a.signer.verify(r),snapshot:r.rehearsal.snapshot?.version,proofBundle:r.dossier?.integrity.proof_bundle.version}:null;
      },[tool,decision,gesture]);
      check(`${tool}: decision and demo signature`,!!record&&record.verified&&record.snapshot==='cyclone.rehearsal/1'&&record.proofBundle==='2.0',record);
    }
    await page.evaluate(()=>document.fonts.ready);
    result.fonts=await page.evaluate(()=>{
      const c=window.cyclone,labels=[];c.stage.root.traverse(o=>{if(o.userData.label)labels.push(o.userData.label.fonts)});
      const canvas=document.createElement('canvas'),g=canvas.getContext('2d');g.font='20px "Atkinson Hyperlegible Next"';
      return {faces:Array.from(document.fonts).map(f=>({family:f.family,weight:f.weight,status:f.status})),labels,digits:Array.from({length:10},(_,n)=>g.measureText(String(n)).width)};
    });
    const fonts=await page.evaluate(async()=>Promise.all(['manrope.ttf','atkinsonhyperlegiblenext-tabular.ttf','manrope700.ttf','atkinson400.ttf','atkinson700.ttf'].map(async name=>{const r=await fetch(new URL(`assets/fonts/${name}`,location.href));return {url:r.url,status:r.status}})));
    check('local fonts load under the production subpath',fonts.every(f=>f.status===200&&f.url.startsWith(base)),fonts);
    check('rendered labels use loaded fonts and tabular digits',result.fonts.labels.length>0&&result.fonts.labels.every(s=>s==='ready')&&new Set(result.fonts.digits).size===1,result.fonts.digits);
    check('Stillpoint logo and icon load',await page.evaluate(async()=>document.querySelector('h1 img').naturalWidth>0&&(await fetch(document.querySelector('link[rel="icon"]').href)).status===200));
    check('no failed requests',failed.length===0,failed);
    check('no page errors',errors.length===0,errors);
  } finally {
    Object.assign(result,{at:new Date().toISOString(),blocked,requests,failed,errors});
    writeFileSync(resolve(workspaceRoot,process.env.CYCLONE_EVIDENCE ?? '../docs/revision1','production.json'),JSON.stringify(result,null,2));
    // This isolated context belongs to this check, not the managed application.
    await isolated.close();
  }
  return result;
}
