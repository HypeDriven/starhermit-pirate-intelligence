import {frame,levelSettings,stats,setBusy} from 'starhermit:engine';
import {scene,renderer,Color,Fog,Vector3,ACESFilmicToneMapping,PCFShadowMap} from 'starhermit:scene';
import {visualProfile} from './quality.js';
import {MaritimeSky} from './sky.js';
import {CinematicWater,frameSize} from './water.js';
import {maritimeVolumes} from './volumes.js';
import {SeaRain} from './precipitation.js';
import {ShoreDetail} from './shore-detail.js';
import {weatherUniform,cloudSun} from './weather.js';

// Bounded ray integration through the marine aerosol layer. Cloud coverage
// modulates sunlight along each ray, making shafts move with the weather.
const HAZE=`
fn aerosol(p: vec3f) -> f32 {
 let h=exp(-max(0.0,p.y+2.0)*0.018);
 let bank=0.65+0.35*sin(p.x*0.008+uniforms.time*0.03)*sin(p.z*0.007);
 return h*bank*mix(0.00035,0.0024,uniforms.storm);
}
fn pixel(p: Pixel) -> vec4f {
 let original=scene_color(p.uv);let cam=camera_position();let depth=scene_depth(p.uv);
 let world=world_position(p.uv,min(depth,2600.0));let ray=normalize(world-cam);
 var reach=min(2000.0,length(world-cam));
 if(ray.y< -0.001){reach=min(reach,max(0.0,(-2.1-cam.y)/ray.y));}
 let count=uniforms.samples;let stepSize=reach/count;
 let jitter=fract(sin(dot(p.coord.xy,vec2f(12.9898,78.233)))*43758.5453);
 let mu=dot(ray,uniforms.sunDir);let phase=0.035/(pow(max(0.08,1.0+0.64-1.6*mu),1.5));
 var trans=1.0;var scatter=vec3f(0.0);
 for(var i=0;i<32;i++){
  if(f32(i)>=count){break;}
  let point=cam+ray*(f32(i)+jitter)*stepSize;let density=aerosol(point);
  let cloudPoint=point.xz+uniforms.sunDir.xz*(180.0-point.y)/max(0.1,uniforms.sunDir.y);
  let coverage=0.5+0.5*sin(cloudPoint.x*0.009+uniforms.time*0.006)*sin(cloudPoint.y*0.008);
  let sun=1.0-smoothstep(0.25,0.75,coverage)*mix(0.35,0.9,uniforms.storm);
  let extinction=exp(-density*stepSize);let light=uniforms.skyColor*0.45+uniforms.sunColor*(phase+0.06)*sun;
  scatter=scatter+trans*(1.0-extinction)*light;trans=trans*extinction;
 }
 return vec4f(original.rgb*trans+scatter,original.a);
}`;

export class MaritimeGraphics {
 readonly sky=new MaritimeSky();
 water:CinematicWater|null=null;
 private rain:SeaRain|null=null;
 private shore:ShoreDetail|null=null;
 profile=visualProfile(0);
 private level=-1;
 private frameAverage=1/60;
 private postUniforms={samples:{value:4},time:{value:0},storm:{value:0},sunDir:{value:this.sky.sunDirection},sunColor:{value:this.sky.radiance},skyColor:{value:new Vector3(.38,.62,.78)}};
 constructor(private places:any[],private fallback:any,private wakes:any[],private crumbs:any[],private shoals:any[],private sun:any,private ambient:any,private hemi:any){
  renderer.toneMapping=ACESFilmicToneMapping;renderer.shadowMap.type=PCFShadowMap;
 }
 begin(time:number,dt:number,camera:any,storm:boolean,zoom:number){
  const f=frame(),settings=levelSettings();
  if(f.levelIndex!==this.level){
   this.level=f.levelIndex;this.profile=visualProfile(this.level);const p=this.profile;
   setBusy("Preparing maritime graphics",{seconds:120});
   this.water?.dispose();this.water=p.fft?new CinematicWater(p,this.places,this.sky,this.wakes,this.crumbs,this.shoals):null;
   this.shore?.dispose();this.shore=p.index>=6?new ShoreDetail(this.places,p.index):null;
   setBusy(null);
   this.rain?.dispose();this.rain=p.index>=4?new SeaRain([0,0,0,0,384,640,1024,2048,3072,4096][p.index]):null;
   maritimeVolumes.configure(p);renderer.antialias=settings.antialias;
   renderer.ao=settings.ao?{resolution:settings.ao.resolution,samples:settings.ao.samples,radius:2.2,thickness:1.4,scale:1.1,blendIntensity:.65,denoise:{samples:settings.ao.denoiseSamples,radius:8}}:null;
   renderer.bloom=settings.bloom?{resolution:settings.bloom.resolution,threshold:1.25,strength:.16,radius:.55}:null;
   renderer.grade=settings.grade?{space:'display',saturation:1.04,contrast:.035,shadows:[.97,1,1.025],highlights:[1.025,1.01,.975],amount:.65,vignette:{amount:.13,inner:.3,outer:.95}}:null;
   this.sun.shadow.mapSize=settings.shadowMapSize;this.sun.shadow.receiverPlane=this.level>=5;this.sun.shadow.radius=this.level>=7?2.5:1.5;
   this.sun.shadow.cascades=this.level>=4?{count:Math.min(4,settings.shadowCascades),maxDistance:Math.min(1800,600*settings.shadowDistance),splitLambda:.72}:null;
   const sc=this.sun.shadow.camera;sc.left=-90;sc.right=90;sc.top=90;sc.bottom=-90;sc.near=1;sc.far=1200;sc.updateProjectionMatrix();
   renderer.post=p.hazeSteps?{pixel:HAZE,uniforms:this.postUniforms}:null;
   console.info('Maritime graphics: '+f.level+' · '+(p.fft?p.oceanResolution+'² × 4 FFT ocean':'analytic ocean')+' · '+p.volumeSteps+' volume steps');
  }
  this.frameAverage+=(dt-this.frameAverage)*Math.min(1,dt*2);
  this.shore?.update(time);
  this.sky.update(time,dt,storm,camera.position);cloudSun.copy(this.sky.sunDirection);const light=this.sky.day;
  this.sun.position.copy(camera.position).addScaledVector(this.sky.sunDirection,500);this.sun.target.position.copy(camera.position);
  this.sun.color.setRGB(this.sky.radiance.x,this.sky.radiance.y,this.sky.radiance.z);this.sun.intensity=Math.PI;
  this.ambient.intensity=.09*Math.PI;this.ambient.color.set('#a7c8df');
  this.hemi.intensity=(.12+light*.2)*Math.PI;this.hemi.color.set('#8ebadd');
  renderer.toneMappingExposure=1.05+(1-light)*.22;renderer.shadowMap.enabled=settings.shadows&&(zoom>.25||this.level>=6);
  const fogColor=new Color().setRGB(.018+light*.27,.03+light*.43,.065+light*.5).multiplyScalar(1-this.sky.storm*.4);
  scene.fog=new Fog(fogColor,storm?750:1300,storm?2200:3400);
  weatherUniform.value=this.sky.storm;
  const u=this.postUniforms;u.samples.value=this.profile.hazeSteps;u.time.value=time;u.storm.value=this.sky.storm;(u.skyColor.value as Vector3).set(fogColor.r,fogColor.g,fogColor.b);
  frameSize.set(Math.max(1,f.width),Math.max(1,f.height));maritimeVolumes.beginShips();
 }
 finish(dt:number,time:number,camera:any,focus:any,storm:boolean,wind:number,knots:number,zoom:number,visible:boolean,bodies:{id:string,x:number,z:number}[]){
  maritimeVolumes.update(dt,time,focus,wind,knots,storm,zoom,visible);
  this.rain?.update(time,camera,wind,knots,visible?this.sky.storm*zoom:0);
  this.fallback.visible=visible&&!this.water;
  if(this.water){
   this.water.mesh.visible=visible;
   const reflectedVolumes=this.profile.index>=7&&visible,effects=maritimeVolumes.group.effects;
   // The mirror has its own camera; its volumes must not clip against the
   // main view's opaque depth. Restore before the window's draw.
   if(reflectedVolumes)for(const e of effects){e.depthAware=false;e.update(0,maritimeVolumes.group.lighting,scene.fog);}
   try{this.water.update(dt,time,camera,storm,wind,knots,reflectedVolumes?[this.fallback,this.sky.dome]:[this.fallback,this.sky.dome,maritimeVolumes.group as any],bodies);}
   finally{if(reflectedVolumes)for(const e of effects){e.depthAware=true;e.update(0,maritimeVolumes.group.lighting,scene.fog);}}
  }
 }
 description(){
  const f=frame(),p=this.profile,gpu=stats().gpu;
  return f.level[0].toUpperCase()+f.level.slice(1)+' · '+Math.round(1/Math.max(.001,this.frameAverage))+' FPS'+(gpu&&gpu.frames?' · GPU '+gpu.totalMs.toFixed(1)+' ms':'')+'\n'+(p.fft?p.oceanResolution+' × '+p.oceanResolution+' spectral waves in four cascades; '+p.reflectionWidth+'px reflections.':'Animated ocean with shoreline foam and wakes.')+' '+(p.clouds?p.clouds+' volumetric cloud banks, '+p.volumeSteps+' ray samples and '+p.volumeShadows+' light samples.':'Particle smoke.');
 }
 dispose(){this.shore?.dispose();this.rain?.dispose();this.water?.dispose();this.sky.dispose();maritimeVolumes.dispose();}
}
