// Instrument the actual running WebAudio graph and mounted caption labels.
// Cue injection is a fixture; first-shift videos separately retain organic event audio.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export default async function run({frame,workspaceRoot}) {
  const result=await frame.evaluate(async()=>{
    const c=window.cyclone,{Synth}=await import('/src/audio/synth.ts');
    const synth=await new Promise((resolve,reject)=>{
      const listener=Synth.prototype.listener;
      const timer=setTimeout(()=>{Synth.prototype.listener=listener;reject(Error('Audio graph not running'))},3000);
      Synth.prototype.listener=function(...args){Synth.prototype.listener=listener;clearTimeout(timer);listener.apply(this,args);resolve(this)};
    });
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
    const check=(name,ok,detail)=>{checks.push({name,ok,detail});if(!ok)throw Error(name)};
    const Vec=c.stage.root.position.constructor,world=point=>new Vec(...point).applyMatrix4(c.stage.root.matrixWorld).toArray();
    const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
    check('AudioContext is running after XR entry',synth.ctx?.state==='running');
    const incoming=await c.app.engine.factory.build(c.app.engine.template('conveyor-2'));
    const arrival=performance.now();await c.app.shift.receive(incoming);await wait(600);
    const token=c.stage.views.get(incoming.intent_id),elapsed=performance.now()-arrival;
    check('scenario intent appears and settles in its tray within one second',!!token&&token.place==='tray'&&token.tween===1&&elapsed<1000,{elapsedMs:elapsed,place:token?.place});
    await wait(1200);
    const voices=[...synth.voices].map(([id,v])=>{
      const rig=c.stage.rigs.get(id),p=rig.root.getWorldPosition(new Vec()).toArray();
      const actual=[v.panner.positionX.value,v.panner.positionY.value,v.panner.positionZ.value];
      const risk=Math.max(0,...[...c.stage.views.values()].filter(x=>x.token.status==='held'&&x.token.intent.target.asset_id===id).map(x=>x.token.intent.risk.level));
      return {id,kind:rig.kind,world:p,panner:actual,error:distance(p,actual),wave:v.osc.type,base:v.base,hz:v.osc.frequency.value,expectedHz:v.base*Math.pow(2,[0,3,7,12][risk]/12),risk};
    });
    check('all four machine voices sit on their target assets',voices.length===4&&voices.every(v=>v.error<.002),voices);
    check('machines have distinct waveforms and pitches',new Set(voices.map(v=>v.wave)).size===4&&new Set(voices.map(v=>v.base)).size===4);
    check('held risk raises only its machine pitch',voices.every(v=>Math.abs(v.hz-v.expectedHz)<1),voices.map(v=>({id:v.id,risk:v.risk,hz:v.hz,expected:v.expectedHz})));
    const threads=[...c.stage.views.values()].filter(v=>v.thread?.visible).map(v=>{
      const a=v.thread.geometry.attributes.position,actual=new Vec(a.getX(1),a.getY(1),a.getZ(1)).applyMatrix4(v.thread.matrixWorld).toArray();
      const p=c.stage.rigs.get(v.token.intent.target.asset_id).root.getWorldPosition(new Vec());
      c.stage.toDesk(p);p.y+=.05;p.applyMatrix4(c.stage.root.matrixWorld);
      return {intent:v.token.id,asset:v.token.intent.target.asset_id,actual,expected:p.toArray(),error:distance(actual,p.toArray())};
    });
    check('every visible thread ends on its intent target',threads.length>0&&threads.every(x=>x.error<.00001),threads);
    c.app.settings.set('captions',true);
    const destination=synth.ctx.createMediaStreamDestination();synth.master.connect(destination);
    const recorder=new MediaRecorder(destination.stream),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();
    const analyzer=synth.ctx.createAnalyser();analyzer.fftSize=2048;synth.master.connect(analyzer);
    const cueNames=['drop','unfold','scrub','lock','hold','seal','veto','drill','escalate','deny','rule','expire','risk'];
    const original=synth.cue,calls=[],captions=[];
    synth.cue=function(...args){calls.push(args);return original.apply(this,args)};
    const point=[.07,.1,-.2],expected=world(point);
    try {
      for(const name of cueNames){
        const caption=`Audio check: ${name}`,before=calls.length;
        c.app.cue(name,caption,point,2);await wait(100);
        const matching=calls.slice(before).filter(x=>x[0]===name);
        check(`${name}: one audio call at the stated position`,matching.length===1&&distance(matching[0].slice(1,4),expected)<.00001);
        const labels=[];c.stage.root.traverse(o=>{
          if(!o.userData.label)return;for(let p=o;p;p=p.parent)if(!p.visible)return;
          labels.push({name:o.name,text:o.userData.label.rendered.map(x=>x.text).join(' ')});
        });
        captions.push({name,caption,labels});
        check(`${name}: matching caption rendered`,c.stage.caption===caption&&labels.some(l=>l.text.includes(caption)));
        await wait(name==='hold'?1550:700);
      }
    } finally { synth.cue=original; }
    const samples=new Float32Array(analyzer.fftSize);analyzer.getFloatTimeDomainData(samples);
    const rms=Math.sqrt(samples.reduce((a,v)=>a+v*v,0)/samples.length);
    check('actual audio graph produces a non-silent signal',rms>0.00001,{rms});
    await new Promise(r=>{recorder.onstop=r;recorder.stop()});
    synth.master.disconnect(destination);synth.master.disconnect(analyzer);destination.stream.getTracks().forEach(t=>t.stop());
    const blob=new Blob(chunks,{type:recorder.mimeType});
    return {checks,voices,threads,captions,audio:Array.from(new Uint8Array(await blob.arrayBuffer())),mimeType:recorder.mimeType};
  });
  const {audio,...data}=result,dir=resolve(workspaceRoot,'../docs/revision1');
  writeFileSync(resolve(dir,'audio-cues.webm'),Buffer.from(audio));
  writeFileSync(resolve(dir,'sensory.json'),JSON.stringify({at:new Date().toISOString(),source:'Actual IWER WebAudio graph; injected cue fixtures. No human/device sound-quality claim.',...data},null,2));
  return {checks:data.checks,voices:data.voices,audioFile:resolve(dir,'audio-cues.webm')};
}
