// Smoke-check the public Pages deployment in a fresh browser context after publishing.
export default async function run({browser}){
  const context=await browser.newContext();const page=await context.newPage();
  const errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));
  try{
    await page.goto('https://ocularminds.github.io/cyclone/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.cyclone,undefined,{timeout:30000});
    await page.locator('#enter').click();
    await page.waitForFunction(()=>!!window.cyclone.world.session&&window.cyclone.app.shift.waiting().length>0,undefined,{timeout:20000});
    const result=await page.evaluate(async()=>{
      const a=window.cyclone.app,t=a.shift.waiting()[0],first=a.clock.seconds;
      const record=await a.shift.decide(t.id,'APPROVE','place');
      return {url:location.href,source:a.gate.capabilities.source,xr:!!window.cyclone.world.session,firstTokenSeconds:first,decision:record?.decision.decision,snapshot:record?.rehearsal.snapshot?.version,signature:record?await a.signer.verify(record):false,proofBundle:record?.dossier?.integrity.proof_bundle.version,logo:document.querySelector('h1 img').naturalWidth,assets:[...document.scripts].map(s=>s.src).filter(Boolean)};
    });
    if(result.source!=='demo'||!result.xr||result.firstTokenSeconds>15||result.snapshot!=='cyclone.rehearsal/1'||!result.signature||result.proofBundle!=='2.0'||!result.logo||errors.length||failed.length)throw Error(JSON.stringify({result,errors,failed}));
    return {...result,browserVersion:browser.version(),errors,failed,at:new Date().toISOString(),inputEvidence:'Programmatic deployment smoke; immersive hand input is tested separately'};
  }finally{await context.close();}
}
