// Browser-side take director for the installed Immersive Web Emulator extension.
// Imported through chrome-capture-server.mjs, using Chrome's supported CDP bridge.
// No app design, scene, materials, fonts, or application decisions are replaced.
import probeModule from './probe.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const probe = () => probeModule({ frame: { evaluate: fn => fn() } });
const held = (s, tool) => s.tokens.find(t => t.tool === tool && t.status === 'held' && ['tray', 'slot'].includes(t.place));

class ChromeHands {
  constructor() { this.remote = window.__IWE_XR_DEVICE__.remote; this.offset = {}; }
  cli(action, args) { return this.remote.dispatch(action.replaceAll('-', '_'), args); }
  async wait(label, predicate, timeout = 30000) {
    const start = performance.now();
    for (;;) {
      const s = await probe();
      if (await predicate(s)) return s;
      if (performance.now() - start > timeout) throw Error(`Timeout: ${label}`);
      await sleep(100);
    }
  }
  async calibrate() {
    for (const [device, side, p] of [['hand-left', 'left', [-.1, 1.3, -.3]], ['hand-right', 'right', [.1, 1.3, -.3]]]) {
      await this.cli('animate-to', { device, position: { x:p[0], y:p[1], z:p[2] }, orientation: { pitch:-70, yaw:0, roll:0 }, duration:.2 });
      await sleep(300);
      const { world } = window.cyclone;
      const g = world.player.gripSpaces[side].getWorldPosition(new world.scene.position.constructor()).toArray();
      this.offset[device] = g.map((n,i) => n-p[i]);
    }
    const s = await probe();
    this.leftRest = [s.head[0]-.25,s.head[1]-.3,s.head[2]-.1];
    this.rightRest = [s.head[0]+.25,s.head[1]-.3,s.head[2]-.1];
  }
  async move(device, p, duration=.4) {
    const o=this.offset[device]??[0,0,0];
    await this.cli('animate-to',{device,position:{x:p[0]-o[0],y:p[1]-o[1],z:p[2]-o[2]},orientation:{pitch:-70,yaw:0,roll:0},duration});
    await sleep(250);
  }
  async pinch(device,value) { await this.cli('set-select-value',{device,value}); await sleep(250); }
  async look(p) { await this.cli('look-at',{device:'headset',target:{x:p[0],y:p[1],z:p[2]}}); await sleep(600); }
  async park() { await this.move('hand-left',this.leftRest); await this.move('hand-right',this.rightRest); }
  async lift(device,p) { const o=this.offset[device]; await this.cli('set-transform',{device,position:{x:p[0]-o[0],y:p[1]-o[1],z:p[2]-o[2]}}); }
  async carry(from,to,hand='hand-right') {
    await this.move(hand,[from[0],from[1]+.12,from[2]]);
    await this.move(hand,[from[0],from[1]+.01,from[2]]);
    await this.pinch(hand,1);
    const h=[to[0],to[1]+.01,to[2]];
    await this.move(hand,h,1.5);
    await this.pinch(hand,0);
    await this.move(hand,[h[0]+.15,h[1]+.2,h[2]+.15]);
  }
  async click(name,id) {
    const p=window.cyclone.stage.root.getObjectByName(name),e=p.requireElementById(id);
    const at=e.getWorldPosition(new p.position.constructor());
    await this.cli('look-at',{device:'hand-right',target:{x:at.x,y:at.y,z:at.z}});
    await sleep(350); await this.cli('select',{device:'hand-right',duration:.2}); await sleep(300);
  }
  async palms(at) {
    const q={x:Math.sin(-70*Math.PI/360),y:0,z:0,w:Math.cos(-70*Math.PI/360)};
    const pos=(device,dx)=>{const o=this.offset[device];return{x:at[0]+dx-o[0],y:at[1]+.01-o[1],z:at[2]-o[2]}};
    await this.cli('set-device-state',{state:{hands:{left:{position:pos('hand-left',-.03),orientation:q},right:{position:pos('hand-right',.03),orientation:q}}}});
  }
}

async function startRecording(name) {
  const c=window.cyclone,device=window.__IWE_XR_DEVICE__,app=c.world.renderer.domElement;
  if(!c.world.session || device.name!=='Meta Quest 3' || device.primaryInputMode!=='hand') throw Error('A Quest 3 hands-only extension session is required');
  if(app.width!==3840 || app.height!==2160) throw Error(`Native 4K app framebuffer required, got ${app.width}×${app.height}`);
  const synth=c.world.systems.find(s=>s.synth)?.synth;
  if(!synth?.ctx || !synth.master) throw Error('Application audio is unavailable');
  const z=el=>Number(getComputedStyle(el).zIndex)||0;
  const room=[...document.querySelectorAll('canvas')].filter(k=>k!==app&&z(k)<z(app)).sort((a,b)=>z(a)-z(b));
  const hidden=[];
  for(const e of document.querySelectorAll('*')) if(e.shadowRoot || (e.tagName==='CANVAS'&&e!==app&&z(e)>z(app))) {
    hidden.push([e,e.style.visibility]); e.style.visibility='hidden';
  }
  const layers=await Promise.all([...room,app].map(async k=>{
    const v=document.createElement('video');v.muted=true;v.playsInline=true;v.srcObject=k.captureStream(30);
    Object.assign(v.style,{position:'fixed',left:'0',top:'0',width:'2px',height:'2px',opacity:'0',pointerEvents:'none',zIndex:'-1'});
    document.body.appendChild(v);await v.play();return v;
  }));
  const out=document.createElement('canvas');out.width=3840;out.height=2160;
  const ctx=out.getContext('2d',{alpha:false});
  const r={name,start:performance.now(),frames:0,events:[],running:true,source:'External Google Chrome; installed Immersive Web Emulator 2.0.0 / IWER '+device.version,canvas:[3840,2160],sources:[...room,app].map(k=>({app:k===app,width:k.width,height:k.height})),hidden,layers,out,synth};
  const draw=()=>{if(!r.running)return;ctx.fillStyle='#000';ctx.fillRect(0,0,3840,2160);for(const v of layers)if(v.videoWidth)ctx.drawImage(v,0,0,3840,2160);r.frames++;requestAnimationFrame(draw)};
  draw();
  r.audio=synth.ctx.createMediaStreamDestination();synth.master.connect(r.audio);
  r.stream=out.captureStream(30);for(const t of r.audio.stream.getAudioTracks())r.stream.addTrack(t);
  const mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus'].find(MediaRecorder.isTypeSupported);
  r.recorder=new MediaRecorder(r.stream,{mimeType,videoBitsPerSecond:24000000,audioBitsPerSecond:192000});r.chunks=[];
  r.recorder.ondataavailable=e=>{if(e.data.size)r.chunks.push(e.data)};
  r.off=c.app.bus.on('cue',e=>r.events.push({seconds:(performance.now()-r.start)/1000,...e}));
  r.recorder.start(1000);window.cycloneRecording=r;
  return r;
}

async function save(name,extension,body,type) {
  const response=await fetch(`/__capture/${name}.${extension}`,{method:'POST',headers:{'Content-Type':type},body});
  if(!response.ok)throw Error(`Could not save ${name}.${extension}: ${response.status}`);
  return response.json();
}

async function stopRecording() {
  const r=window.cycloneRecording;
  await new Promise(done=>{r.recorder.onstop=done;r.recorder.stop()});
  r.duration=(performance.now()-r.start)/1000;r.running=false;r.off();r.synth.master.disconnect(r.audio);
  for(const t of r.stream.getTracks())t.stop();for(const v of r.layers){v.srcObject.getTracks().forEach(t=>t.stop());v.remove()}
  for(const [e,visibility]of r.hidden)e.style.visibility=visibility;
  const blob=new Blob(r.chunks,{type:r.recorder.mimeType});
  const final=await probe();
  const meta={source:r.source,name:r.name,at:new Date().toISOString(),duration:r.duration,canvas:r.canvas,sources:r.sources,type:r.recorder.mimeType,bytes:blob.size,compositorFrames:r.frames,compositorFps:r.frames/r.duration,events:r.events,checks:window.cycloneTake.checks,beats:final.beats,ledger:final.ledger,summary:final.summary,claims:'Synthetic hands; demo signatures; simulated execution; real-time capture, no generated or substituted UI.'};
  const saved=await save(r.name,'webm',blob,r.recorder.mimeType);
  await save(r.name,'json',JSON.stringify(meta,null,2),'application/json');
  r.chunks=[];return saved;
}

function mark(name) { const r=window.cycloneRecording;r.events.push({seconds:(performance.now()-r.start)/1000,mark:name});window.cycloneTake.progress=name; }
function check(name,ok,detail) { window.cycloneTake.checks.push({name,ok,detail});if(!ok)throw Error(`Check failed: ${name}`); }

export async function install() {
  if(!window.__IWE_XR_DEVICE__?.remote)throw Error('Installed Quest extension is not active');
  const take={status:'ready',progress:'ready',checks:[],driver:new ChromeHands(),probe,
    async start(name='workflow') { if(this.status==='recording')throw Error('Already recording');this.status='recording';this.checks=[];try{this.result=await ({workflow,details,endcard,preflight})[name](this.driver);this.status='complete'}catch(error){this.error=String(error.stack??error);this.status='failed';console.error(error)} },
    async still(name='quality') { const r=window.cycloneRecording;if(!r)throw Error('Start a capture first');return save(name,'png',await new Promise(done=>r.out.toBlob(done,'image/png')),'image/png'); }
  };window.cycloneTake=take;return {ready:true,device:window.__IWE_XR_DEVICE__.name};
}

async function prepare(d) {
  await d.cli('set-input-mode',{mode:'hand'});
  await d.calibrate();await d.park();
  const s=await d.wait('anchored',x=>x.ready&&x.anchor!=='pending');
  check('Quest 3 hands-only immersive session',!!window.cyclone.world.session&&window.__IWE_XR_DEVICE__.primaryInputMode==='hand');
  check('Plane or plinth anchor', ['plane','plinth'].includes(s.anchor),s.anchor);return s;
}

async function preflight(d) {
  await prepare(d);let s=await d.wait('conveyor',x=>held(x,'set_conveyor_speed'));await d.look(held(s,'set_conveyor_speed').at);
  await d.wait('card open',x=>x.focus===held(x,'set_conveyor_speed')?.id);await sleep(1000);
  await startRecording('preflight');mark('inspect');await sleep(4000);await window.cycloneTake.still();return stopRecording();
}

async function workflow(d) {
  await d.cli('set-input-mode',{mode:'hand'});await startRecording('workflow');mark('shift-start');
  await prepare(d);let s=await d.wait('conveyor',x=>held(x,'set_conveyor_speed'));
  check('First token within 15 seconds',Number(s.beats.find(b=>b.startsWith('first_token@'))?.split('@')[1])<=15,s.beats);
  await sleep(4000);s=await probe();let tok=held(s,'set_conveyor_speed');await d.look(tok.at);await d.wait('conveyor inspected',x=>x.focus===tok.id);mark('conveyor-inspect');
  await sleep(3500);s=await probe();tok=s.tokens.find(t=>t.id===tok.id);const glyph=tok.glyph;
  await d.carry(tok.at,s.slot);s=await d.wait('conveyor sealed',x=>x.ledger.length===1);mark('conveyor-sealed');
  check('Place approves the conveyor',s.ledger[0].decision==='APPROVE'&&s.ledger[0].gesture==='place');
  check('Conveyor seal preserves its glyph',s.ledger[0].glyph===glyph.slice(0,16));
  check('Satisfying beat within 90 seconds',s.t<=90,s.t);await sleep(1800);
  s=await d.wait('arm',x=>held(x,'set_arm_velocity'));tok=held(s,'set_arm_velocity');await d.look(tok.at);s=await d.wait('arm inspected',x=>x.focus===tok.id&&x.handleVisible);mark('arm-inspect');
  check('Arm at 250 breaches the walkway',tok.breach==='walkway-w1');const originalGlyph=tok.glyph;await sleep(4500);
  const toward=[s.head[0]-s.handle[0],0,s.head[2]-s.handle[2]],length=Math.hypot(toward[0],toward[2]);mark('scrub-start');
  await d.carry(s.handle,[s.handle[0]+toward[0]/length*.12,s.handle[1],s.handle[2]+toward[2]/length*.12]);
  s=await probe();check('Timeline pull scrubs the real ghost',s.scrub>.8,s.scrub);mark('scrub-complete');await sleep(3000);
  mark('amend-start');await d.move('hand-right',[s.dial[0],s.dial[1]+.005,s.dial[2]]);const pose=await d.cli('get-transform',{device:'hand-right'});
  await d.pinch('hand-right',1);await d.cli('animate-to',{device:'hand-right',orientation:{pitch:-70,yaw:(pose.euler?.yaw??0)+106,roll:0},duration:1.2});await sleep(500);await d.pinch('hand-right',0);await d.park();
  s=await d.wait('amended 180',x=>held(x,'set_arm_velocity')?.value<=180);tok=held(s,'set_arm_velocity');mark('amend-complete');
  check('Twist changes to 180 and clears the breach',tok.value===180&&tok.breach===null,{value:tok.value,breach:tok.breach});
  check('Amendment changes the visible hash glyph',tok.glyph!==originalGlyph&&tok.drawnGlyph===tok.glyph);await sleep(4000);
  const card=()=>window.cyclone.stage.root.getObjectByName('inspection').userData;
  await d.lift('hand-right',[s.head[0]+.2,s.head[1]-.15,s.head[2]-.15]);
  window.cyclone.app.settings.set('textScale',1.25);await sleep(700);
  for(let i=0;i<12&&card().page!=='compare';i++)await d.click('card-controls',card().page==='rationale'&&card().pagination.total===1?'a':'c');
  check('Compare opens from the actual card controls',card().page==='compare');mark('compare-start');
  await d.click('card-controls','a');await sleep(3500);await d.click('card-controls','b');await sleep(3500);mark('compare-complete');
  for(let i=0;i<12&&card().page!=='review';i++)await d.click('card-controls','c');window.cyclone.app.settings.set('textScale',1);await d.park();
  s=await probe();tok=held(s,'set_arm_velocity');await d.carry(tok.at,s.slot);s=await d.wait('arm in slot',x=>x.tokens.some(t=>t.id===tok.id&&t.place==='slot'));mark('abort-start');
  const at=s.tokens.find(t=>t.id===tok.id).at;await d.palms(at);await sleep(600);await d.lift('hand-left',d.leftRest);await sleep(800);await d.park();s=await probe();
  check('Early release cancels without a decision',s.ledger.length===1&&s.tokens.find(t=>t.id===tok.id)?.place==='tray');mark('abort-complete');await sleep(3000);
  s=await probe();await d.carry(s.tokens.find(t=>t.id===tok.id).at,s.slot);s=await d.wait('arm placed again',x=>x.tokens.some(t=>t.id===tok.id&&t.place==='slot'));const at2=s.tokens.find(t=>t.id===tok.id).at;
  mark('hold-start');await d.palms(at2);s=await d.wait('amended arm sealed',x=>x.ledger.length===2);mark('arm-sealed');await d.park();
  check('Two-hand hold approves the amended binding',s.ledger[1].decision==='APPROVE_AMENDED'&&s.ledger[1].gesture==='two_hand_hold',s.ledger[1]);await sleep(2200);
  s=await d.wait('oven',x=>held(x,'set_oven_setpoint'));tok=held(s,'set_oven_setpoint');await d.look(tok.at);await d.wait('oven inspected',x=>x.focus===tok.id);await sleep(1200);s=await probe();mark('oven-lock-start');
  await d.carry(s.tokens.find(t=>t.id===tok.id).at,s.slot);s=await d.wait('oven refused',x=>x.tokens.find(t=>t.id===tok.id)?.place==='tray');mark('oven-locked');
  check('Forbidden oven cannot execute',s.ledger.length===2);await sleep(3000);mark('veto-start');
  await d.carry(s.tokens.find(t=>t.id===tok.id).at,s.offEdge);s=await d.wait('oven vetoed',x=>x.ledger.length===3);mark('oven-vetoed');
  check('Desk-edge gesture vetoes the oven',s.ledger[2].decision==='REJECT'&&s.ledger[2].gesture==='veto_push');await sleep(2200);
  s=await d.wait('pallet',x=>held(x,'lift_pallet'));tok=held(s,'lift_pallet');await d.look(tok.at);await d.wait('pallet inspected',x=>x.focus===tok.id);mark('pallet-inspect');await sleep(4500);s=await probe();mark('pallet-decide');
  await d.carry(s.tokens.find(t=>t.id===tok.id).at,s.slot);s=await d.wait('drill reveal',x=>x.summary.drillsMissed===1);mark('drill-revealed');
  check('Drill reveal follows the decision and updates calibration',s.calibration.startsWith('0%'),s.calibration);await sleep(8000);
  s=await d.wait('summary',x=>x.beats.some(b=>b.startsWith('summary')),40000);mark('summary');
  check('Summary matches the captured decisions',s.summary.decisions===4&&s.summary.amended===1&&s.summary.vetoed===1&&s.summary.drillsMissed===1,s.summary);await sleep(2500);
  return stopRecording();
}

async function details(d) {
  await prepare(d);let s=await d.wait('conveyor',x=>held(x,'set_conveyor_speed'));let tok=held(s,'set_conveyor_speed');await d.look(tok.at);await sleep(900);s=await probe();await d.carry(s.tokens.find(t=>t.id===tok.id).at,s.slot);await d.wait('one receipt',x=>x.ledger.length===1);await d.park();
  await startRecording('details');mark('details-start');s=await probe();const at=s.seals[0];await d.look(at);await d.move('hand-right',[at[0],at[1]+.10,at[2]]);await d.move('hand-right',[at[0],at[1]+.01,at[2]]);await d.pinch('hand-right',1);await d.wait('receipt open',()=>window.cyclone.stage.replayOpen);await d.pinch('hand-right',0);await d.lift('hand-right',d.rightRest);mark('receipt-open');
  check('Physical seal pickup opens retained rehearsal',window.cyclone.stage.replayOpen);await sleep(8500);
  const p=()=>window.cyclone.stage.root.getObjectByName('receipt-detail').userData;
  for(let i=0;i<15&&p().page!=='proof';i++)await d.click('receipt-controls',(p().page==='action'||p().page==='menu')&&p().pagination.total===1?'b':'c');
  check('Receipt controls open actual proof page',p().page==='proof');mark('demo-proof');await sleep(8000);
  for(let i=0;i<20&&window.cyclone.stage.replayOpen;i++)await d.click('receipt-controls','c');check('Receipt closes from its controls',!window.cyclone.stage.replayOpen);
  s=await probe();await d.look(s.puck);await d.move('hand-right',[s.puck[0],s.puck[1]+.1,s.puck[2]]);await d.move('hand-right',[s.puck[0],s.puck[1]+.01,s.puck[2]]);await d.pinch('hand-right',1);await d.pinch('hand-right',0);await d.wait('settings',x=>x.settingsOpen);await d.lift('hand-right',d.rightRest);
  await d.wait('settings controls mounted',()=>window.cyclone.stage.root.getObjectByName('settings-panel')?.userData.actions?.length>0);
  const action=async id=>{const a=window.cyclone.stage.root.getObjectByName('settings-panel').userData.actions,i=a.findIndex(x=>x.id===id);if(i<0)throw Error(`Missing settings action ${id}`);await d.click('settings-panel',`action-${'abc'[i]}`)};
  await action('page:input');mark('input-controls');await sleep(6500);await d.click('settings-panel','back');await action('page:display');await action('text');mark('larger-text');await sleep(6500);
  check('Settings changes actual text scale',window.cyclone.app.settings.snapshot().textScale===1.25);await d.click('settings-panel','close');mark('settings-closed');await sleep(1500);return stopRecording();
}

async function endcard(d) {
  await prepare(d);let s=await probe();check('End card contains the four captured seals',s.seals.length===4&&s.tokens.length===0,{seals:s.seals.length,tokens:s.tokens.length});
  await d.cli('animate-to',{device:'hand-right',position:{x:.6,y:.4,z:.6},duration:.2});await d.cli('animate-to',{device:'hand-left',position:{x:-.6,y:.4,z:.6},duration:.2});await d.look([s.deskRoot[0],s.deskRoot[1]+.04,s.deskRoot[2]-.15]);await sleep(1000);
  const visible=o=>{if(!o)return false;for(;o;o=o.parent)if(!o.visible)return false;return true};
  check('End card hides the application HUD and captions',['cue-caption','feedback','shift-summary','inspection','receipt-detail','settings-panel'].every(n=>!visible(window.cyclone.stage.root.getObjectByName(n))));
  check('Seals are evenly spaced',s.seals.every((p,i)=>i===0||Math.abs(p[0]-s.seals[i-1][0]-.032)<.001));
  await startRecording('endcard');mark('endcard');await sleep(10000);return stopRecording();
}
