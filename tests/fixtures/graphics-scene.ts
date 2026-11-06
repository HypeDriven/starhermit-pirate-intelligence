// Deterministic presentation-only workload: no authority, saves or model downloads.
// scripts/check-graphics.sh copies this entry beside the game's real modules.
import {frame,onRender,stats,usage,setBusy} from 'starhermit:engine';
import {launchContext} from 'starhermit:platform';
import {scene,renderer,PerspectiveCamera,DirectionalLight,AmbientLight,HemisphereLight} from 'starhermit:scene';
import {onKey} from 'starhermit:input';
import * as draw from 'starhermit:draw';
import {shipModel,createOcean,oceanWakeData,setWakes,animateEnvironment} from './visuals.js';
import {buildIslands,animateIslands} from './islands.js';
import {MaritimeGraphics} from './render/graphics.js';
import {maritimeVolumes} from './render/volumes.js';
import {CinematicWater} from './render/water.js';
import {visualProfile} from './render/quality.js';

const places=[
 {id:'saltwick',kind:'port',x:-22,z:8}, {id:'mossjaw',kind:'island',x:12,z:17,jobs:['timber','treasure','forage','herbs']},
 {id:'gallows',kind:'port',x:25,z:-19}, {id:'rattle',kind:'island',x:-22,z:-23,jobs:['timber','treasure','ruins']},
 {id:'wreck',kind:'wreck',x:32,z:23,jobs:['salvage']}, {id:'brasshaven',kind:'port',x:-44,z:36},
 {id:'winterwake',kind:'port',x:38,z:-45}, {id:'cinder',kind:'island',x:48,z:-2,jobs:['treasure','powder','forage']},
 {id:'whisper',kind:'island',x:-45,z:-38,jobs:['timber','herbs','ruins']}
];
buildIslands(places);const {sea}=createOcean(places);
const camera=new PerspectiveCamera(48,16/9,.5,4000);renderer.camera=camera;
const sun=new DirectionalLight('#fff0d6',3.14),ambient=new AmbientLight('#b3ccdd',.3),hemi=new HemisphereLight('#9dbddb','#1c3938',.6);
sun.castShadow=true;scene.add(sun,sun.target,ambient,hemi);
const graphics=new MaritimeGraphics(places,sea,oceanWakeData.wakes,oceanWakeData.crumbs,oceanWakeData.shoals,sun,ambient,hemi);
const fleet=Array.from({length:3},(_,i)=>{const s=shipModel(i>0);s.g.position.set(120+i*38,0,217-i*12);s.g.rotation.y=i?.6:Math.PI*.7;s.g.userData.waterCaster=true;s.g.traverse(o=>{if((o as any).castShadow)o.layers.enable(1);});scene.add(s.g);return s;});
let mode=0,clock=0,shotAt=0,checked=false;
onKey(e=>{if(e.pressed&&/^Digit[1-4]$/.test(e.code)){mode=Number(e.code.slice(-1))-1;clock=0;graphics.sky.storm=mode===2?1:0;}});
onRender(()=>{
 const f=frame(),dt=Math.min(.1,f.delta);clock+=dt;
 const time=[120,70,115,220][mode],storm=mode===2;
 camera.aspect=f.width/Math.max(1,f.height);camera.position.set(176,21,282);camera.lookAt(145,7,211);camera.updateProjectionMatrix();camera.updateMatrixWorld();
 graphics.begin(time,dt,camera,storm,1);
 const bodies=fleet.map((s,i)=>{
  const wave=graphics.water?.probe.poses.get('ship'+i);s.g.position.y=wave?.height||Math.sin(clock+i)*.15;
  maritimeVolumes.shipFire('ship'+i,s.g.position.x,s.g.position.z,s.g.rotation.y,i===1?75:0,true);
  return {id:'ship'+i,x:s.g.position.x,z:s.g.position.z};
 });
 if(clock>shotAt&&maritimeVolumes.group.ready){for(let i=0;i<3;i++)maritimeVolumes.broadside(125,4.3,211+i*4,1,0,i+Math.floor(clock)*7);shotAt=clock+2.2;}
 setWakes(fleet.map((s,i)=>({id:'ship'+i,x:s.g.position.x,z:s.g.position.z,heading:s.g.rotation.y,way:.8})),clock);
 animateEnvironment(clock,dt,{x:12,z:21.7});animateIslands(clock);
 graphics.finish(dt,clock,camera,{x:12,z:21.7},storm,.6,storm?26:12,1,true,bodies);
 if(!checked&&f.frame>8){
  graphics.sky.material.compile();graphics.water?.material.compile();graphics.water?.sim.compile();
  if(maritimeVolumes.group.shaderError)throw new Error(maritimeVolumes.group.shaderError);
  for(const e of maritimeVolumes.group.effects)if(e.shaderError)throw new Error(e.shaderError);
  console.info('GRAPHICS READY '+f.level+' '+JSON.stringify(usage()));checked=true;
  if(launchContext()?.params?.['quality-sweep']==='true'){
   setBusy('Checking graphics tiers',{seconds:120});
   const before=usage();
   for(const index of [4,9,6,9,4]){
    const water=new CinematicWater(visualProfile(index),places,graphics.sky,oceanWakeData.wakes,oceanWakeData.crumbs,oceanWakeData.shoals);
    water.material.compile();water.sim.compile();water.dispose();
    maritimeVolumes.configure(visualProfile(index));
   }
   maritimeVolumes.configure(graphics.profile);
   const after=usage();
   if(after.textures>before.textures||after.meshes>before.meshes)throw new Error('Quality switch leaked resources: '+JSON.stringify({before,after}));
   console.info('QUALITY SWEEP OK: FFT 64/128/512, repeated Infinite allocations released');setBusy(null);
  }
 }
 draw.text(['Daylight','Golden hour','Storm','Night watch'][mode]+' · '+f.level+' · 1/2/3/4 change weather',16,16,{size:16,color:'#f1e6ca'});
 const gpu=stats().gpu;if(gpu?.frames)draw.text('GPU '+gpu.totalMs.toFixed(2)+' ms · '+gpu.frames+' timed frames',16,40,{size:13,color:'#f1e6ca'});
});
