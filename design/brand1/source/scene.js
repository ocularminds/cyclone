// Original editorial 3D artwork. This scene is not Cyclone runtime evidence.
import * as T from './vendor/three.module.js';
const W=1920,H=1080;
const renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setSize(W,H); renderer.setPixelRatio(1); renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T.PCFSoftShadowMap; renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.12;
document.body.appendChild(renderer.domElement);
const scene=new T.Scene(); scene.background=new T.Color('#142B36');
const camera=new T.OrthographicCamera(-5.33,5.33,3,-3,.1,70);
camera.position.set(7,8.5,11); camera.lookAt(0,.7,0); camera.updateMatrixWorld();
const rig=new T.Group(); rig.position.set(2.0,0,-.15); scene.add(rig);
const mat=(hex,metal=.05,rough=.72)=>new T.MeshStandardMaterial({color:hex,metalness:metal,roughness:rough});
const cream=mat('#F5F1E8'), stone=mat('#D8D4CA'), ink=mat('#142B36',.2), honey=mat('#E9B44C',.2), steel=mat('#70888C',.6,.4), cyan=mat('#62DCE8',.28,.28), berry=mat('#D85CA9');
const dark=mat('#203D48',.15), rim=mat('#43636C',.3);
const emissive=new T.MeshStandardMaterial({color:'#62DCE8',emissive:'#1CB9CA',emissiveIntensity:.45,roughness:.25});
function mesh(g,m,p,parent=rig){const o=new T.Mesh(g,m);o.position.set(...p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function block(w,h,d,m,p){return mesh(new T.BoxGeometry(w,h,d),m,p);}
function cyl(r,h,m,p,r2=r){return mesh(new T.CylinderGeometry(r2,r,h,64),m,p);}
function rounded(w,d,h,r,m,p){const s=new T.Shape(),x=-w/2,z=-d/2;
 s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);
 const g=new T.ExtrudeGeometry(s,{depth:h,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:.035,bevelThickness:.025,curveSegments:16});g.rotateX(-Math.PI/2);return mesh(g,m,p);}
function link(a,b,r,m){a=new T.Vector3(...a);b=new T.Vector3(...b);const v=b.clone().sub(a);const o=mesh(new T.CapsuleGeometry(r,Math.max(.02,v.length()-2*r),8,24),m,a.clone().add(b).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return o;}
function joint(p,r=.2){const core=cyl(r,.29,ink,p);core.rotation.x=Math.PI/2;const cap=cyl(r*.83,.035,honey,[p[0],p[1],p[2]+.163]);cap.rotation.x=Math.PI/2;const pin=cyl(r*.26,.041,steel,[p[0],p[1],p[2]+.186]);pin.rotation.x=Math.PI/2;}
rounded(4.18,2.73,.2,.25,dark,[0,-.06,0]);
rounded(4.07,2.64,.11,.23,stone,[0,.17,0]);
rounded(3.83,2.40,.018,.19,cream,[0,.295,0]);
// Fine industrial engravings and a distinctly empty walkway.
for(let k=-1;k<=1;k++) block(3.30,.006,.009,stone,[0,.322,k*.59]);
block(.56,.008,2.12,stone,[1.27,.325,0]);
for(let i=0;i<9;i++){block(.028,.013,.095,ink,[.96,.338,-.91+i*.23]);block(.028,.013,.095,ink,[1.58,.338,-.91+i*.23]);}
// Robot: quiet materials with deliberate joint accents.
cyl(.39,.11,ink,[.05,.385,-.17]);cyl(.33,.20,stone,[.05,.535,-.17]);cyl(.27,.075,honey,[.05,.67,-.17]);
link([.05,.70,-.17],[-.51,1.70,-.17],.165,cream);joint([.05,.76,-.17],.22);joint([-.51,1.70,-.17],.20);
link([-.51,1.70,-.17],[.34,2.08,-.17],.145,cream);joint([.34,2.08,-.17],.17);
link([.34,2.08,-.17],[.78,1.61,-.17],.095,steel);joint([.78,1.61,-.17],.13);
block(.31,.10,.23,ink,[.8,1.49,-.17]);block(.045,.20,.17,cream,[.67,1.37,-.17]);block(.045,.20,.17,cream,[.93,1.37,-.17]);
// A compact conveyor anchors the scene's miniature scale.
rounded(1.26,.76,.15,.07,dark,[-.95,.37,.58]);
for(let i=0;i<8;i++){const o=cyl(.042,.98,steel,[-.95,.56,.285+i*.082]);o.rotation.z=Math.PI/2;}
block(1.22,.035,.028,honey,[-.95,.575,.24]);block(1.22,.035,.028,honey,[-.95,.575,.93]);
rounded(.29,.28,.18,.035,cream,[-1.13,.61,.54]);
// One clean cyan rehearsal trace; dotted amber marks the original alternative.
const curve=new T.CatmullRomCurve3([new T.Vector3(-1.28,.67,-.58),new T.Vector3(-1.13,1.60,-.52),new T.Vector3(-.25,2.48,-.24),new T.Vector3(.80,2.20,.00),new T.Vector3(1.28,1.11,.12)]);
mesh(new T.TubeGeometry(curve,100,.015,8,false),emissive,[0,0,0]);
for(const t of [0,1])mesh(new T.SphereGeometry(.045,24,16),emissive,curve.getPoint(t).toArray());
const alt=new T.CatmullRomCurve3([new T.Vector3(-1.28,.67,-.58),new T.Vector3(-1.02,1.50,-.24),new T.Vector3(.10,2.45,.50),new T.Vector3(1.37,2.07,.72),new T.Vector3(1.58,1.0,.65)]);
for(let i=0;i<27;i++){const a=i/28,b=(i+.48)/28; const part=new T.CatmullRomCurve3([alt.getPoint(a),alt.getPoint((a+b)/2),alt.getPoint(b)]);mesh(new T.TubeGeometry(part,5,.009,6,false),honey,[0,0,0]);}
const breach=mesh(new T.OctahedronGeometry(.087,0),berry,alt.getPoint(.9).toArray());breach.rotation.y=.5;
// A physical decision token and a seal. Symbols, never words, on the cover scene.
rounded(.49,.45,.062,.07,ink,[.57,.365,.88]);
rounded(.28,.25,.042,.045,cyan,[.57,.45,.88]);
const smallseal=mesh(new T.OctahedronGeometry(.13,0),cyan,[1.60,.59,-.89]);smallseal.rotation.y=.5;
cyl(.18,.035,dark,[1.6,.37,-.89]);
// Framing strips and a deliberately small pause notch.
block(.24,.023,.031,cyan,[-1.58,.345,-.86]);block(.045,.023,.031,cyan,[-1.76,.345,-.86]);
const floor=mesh(new T.PlaneGeometry(200,200),mat('#142B36',0,.97),[0,-.17,0],scene);floor.rotation.x=-Math.PI/2;
const contact=document.createElement('canvas');contact.width=contact.height=256;const ctx=contact.getContext('2d');const grad=ctx.createRadialGradient(128,128,5,128,128,124);grad.addColorStop(0,'rgba(0,0,0,.6)');grad.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,256,256);
const shadowMat=new T.MeshBasicMaterial({map:new T.CanvasTexture(contact),transparent:true,depthWrite:false});const contactShadow=mesh(new T.PlaneGeometry(5.7,4.5),shadowMat,[0,-.133,0]);contactShadow.rotation.x=-Math.PI/2;contactShadow.castShadow=false;
scene.add(new T.AmbientLight('#D2E3E5',.40));scene.add(new T.HemisphereLight('#FFF1D6','#163441',1.15));
const sun=new T.DirectionalLight('#FFF1D8',4.2);sun.position.set(-3,8,6);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);sun.shadow.camera.left=-8;sun.shadow.camera.right=8;sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;sun.shadow.normalBias=.025;sun.shadow.bias=-.00012;sun.shadow.radius=4;scene.add(sun);
const cool=new T.DirectionalLight('#8EDFEB',1.65);cool.position.set(6,4,-4);scene.add(cool);
renderer.render(scene,camera);window.artReady=true;
window.sceneArtwork={renderer,scene,camera,rig};

const save=document.createElement('button');save.textContent='Save artwork';save.style.cssText='position:fixed;top:24px;left:24px;padding:12px 20px;border-radius:10px;border:1px solid #62DCE8;background:#142B36;color:#F5F1E8;font:16px system-ui;cursor:pointer';save.onclick=()=>{const link=document.createElement('a');link.download='cyclone-cover-artwork.png';link.href=renderer.domElement.toDataURL('image/png');link.click();};document.body.appendChild(save);
