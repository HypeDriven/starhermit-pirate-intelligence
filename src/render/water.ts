import {scene,renderer,Mesh,BufferGeometry,Float32BufferAttribute,ShaderMaterial,Vector2,Vector3,Vector4,DoubleSide} from 'starhermit:scene';
import {OceanSim,defaultOceanParams,oceanSampleWgsl} from './ocean-sim.js';
import {PlanarReflection} from './reflection.js';
import {MaritimeSky,SKY_WGSL} from './sky.js';
import {WaveProbe} from './wave-probe.js';
import type {WaveBody} from './wave-probe.js';
import {WaterShadow,FLOAT_SHADOW_WGSL} from './water-shadow.js';
import {visualProfile} from './quality.js';
import {cloudUniforms} from './weather.js';

type Profile=ReturnType<typeof visualProfile>;
const SEA=-2.1;
const foamWGSL=`
fn shore_distance(p: vec2f) -> f32 {
 var d=10000.0;
 for(var i=0;i<9;i++){let island=uniforms.islands[i];let q=p-island.xy;let a=atan2(q.y/0.88,q.x);
 let coast=island.z*(1.0+sin(a*3.0+f32(i)*2.0)*0.07+cos(a*5.0-f32(i))*0.04);
 d=min(d,length(q/vec2f(1.0,0.88))-coast); }return d;
}
fn foam_noise(p: vec2f) -> f32 {return 0.55+0.22*sin(p.x*2.9+sin(p.y*1.8))*sin(p.y*3.3)+0.18*sin(p.x*9.1+p.y*7.3);}
fn wake_foam(p: vec2f) -> f32 {
 var foam=0.0;
 for(var k=0;k<${95};k++){
  if(f32(k)>=uniforms.wakeCount){break;}
  let a=uniforms.crumbs[k];let b=uniforms.crumbs[k+1];if(a.w<=0.0||b.w<=0.0){continue;}
  let ba=b.xy-a.xy;let pa=p-a.xy;let hr=dot(pa,ba)/max(dot(ba,ba),0.001);let h=clamp(hr,0.0,1.0);
  let age=mix(a.z,b.z,h);let reach=4.0+6.5*max(a.w,b.w)*b.z;
  if(dot(pa,pa)>pow(length(ba)+reach,2.0)){continue;}
  let dist=length(pa-ba*h);let way=mix(a.w,b.w,h);let core=2.2+age*0.55;
  let trail=(1.0-smoothstep(core*0.35,core,dist))*(1.0-smoothstep(1.0,7.5,age));
  let spread=3.4+4.2*way*age;let flank=smoothstep(-0.08,0.02,hr)*(1.0-smoothstep(0.98,1.08,hr));
  let arm=(1.0-smoothstep(0.0,0.55+age*0.12,abs(dist-spread)))*(1.0-smoothstep(0.8,4.5,age))*smoothstep(0.1,0.6,age)*flank;
  foam=max(foam,way*(trail*0.75+arm*0.5));
 }
 for(var k=0;k<8;k++){
  let w=uniforms.wakes[k];let rel=p-w.xy;let along=dot(rel,vec2f(sin(w.z),cos(w.z)));let across=abs(dot(rel,vec2f(cos(w.z),-sin(w.z))));
  let bow=(1.0-smoothstep(0.2,1.4,abs(across-(5.0-abs(along-8.0)*0.38))))*(1.0-smoothstep(0.0,8.0,abs(along-6.0)));
  foam=max(foam,bow*w.w);
 }return foam;
}`;

// A logarithmic grid spends its triangles near the ship and reaches the horizon.
function grid(segments:number){
 const rings=Math.floor(segments*.65),v:number[]=[0,0,0],ix:number[]=[];
 for(let j=0;j<=rings;j++){
  const r=.2*Math.pow(18000,j/rings);
  for(let k=0;k<segments;k++){const a=k/segments*Math.PI*2;v.push(Math.sin(a)*r,0,Math.cos(a)*r);}
 }
 for(let k=0;k<segments;k++)ix.push(0,1+k,1+(k+1)%segments);
 for(let j=0;j<rings;j++)for(let k=0;k<segments;k++){
  const a=1+j*segments+k,b=1+j*segments+(k+1)%segments,c=a+segments,d=b+segments;ix.push(a,c,b,b,c,d);
 }
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.setIndex(ix);return g;
}

export class CinematicWater {
 readonly sim:OceanSim;
 readonly shadow:WaterShadow;
 readonly probe:WaveProbe;
 readonly reflection:PlanarReflection;
 readonly material:ShaderMaterial;
 readonly mesh:Mesh;
 private weatherKey='';
 constructor(readonly profile:Profile,places:any[],sky:MaritimeSky,wakes:Vector4[],crumbs:Vector4[],shoals:Vector4[]){
  const params=defaultOceanParams();params.waveScale=.6;params.swellScale=.55;
  this.sim=new OceanSim(params,1337,true,profile.oceanResolution);
  this.probe=new WaveProbe(this.sim);
  this.shadow=new WaterShadow(profile.index>=8?2048:1024);
  this.reflection=new PlanarReflection(profile.reflectionScale,profile.reflectionWidth,SEA);
  const sampling=oceanSampleWgsl('displacement',3,profile.oceanResolution);
  this.material=new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,uniforms:{
   ...sky.uniforms,...cloudUniforms,...this.shadow.uniforms,depth:{value:renderer.sceneDepth},time:{value:0},displacement:{value:this.sim.displacement},
   slope0:{value:this.sim.slope[0]},slope1:{value:this.sim.slope[1]},slope2:{value:this.sim.slope[2]},slope3:{value:this.sim.slope[3]},
   reflection:{value:this.reflection.target.texture},reflectionMatrix:{value:this.reflection.textureMatrix},
   behind:{value:renderer.sceneColor??null},reflectOn:{value:0},
   islands:{value:places.map(p=>new Vector4(p.x*10,p.z*10,p.kind==='wreck'?6:p.kind==='island'?31:15.5,0))},
   wakes:{value:wakes},crumbs:{value:crumbs},shoals:{value:shoals},wakeCount:{value:profile.wakeSegments},
   centre:{value:new Vector2()},haze:{value:new Vector3(.38,.62,.78)}
  } as ShaderMaterial["uniforms"],vertexShader:sampling+SKY_WGSL+foamWGSL+FLOAT_SHADOW_WGSL+`
   fn vertex(v: Vertex) -> Vertex {
    var o=v;let p=v.position.xz+uniforms.centre;let shore=shore_distance(p);let damp=smoothstep(-3.0,20.0,shore);
    let wave=ocean_displacement(p);let lod=1.0-smoothstep(100.0,1000.0,length(v.position.xz));
    o.position=vec3f(p.x+wave.x*damp*lod,${SEA}+wave.y*damp*lod,p.y+wave.z*damp*lod);
    o.v0=vec4f(p,wave.y,damp);return o;
   }`,fragmentShader:`
   fn fragment(f: Fragment) -> vec4f {
    let p=f.v0.xy;let uv=screen_uv(f.coord);let V=normalize(camera_position()-f.world);
    let s0=textureSample(slope0,slope0_sampler,p/600.0);
    let s1=textureSample(slope1,slope1_sampler,p/85.0);
    let s2=textureSample(slope2,slope2_sampler,p/12.0);
    let s3=textureSample(slope3,slope3_sampler,p/2.1);
    let slope=(s0.xy+s1.xy+s2.xy+s3.xy)*f.v0.w;
    let N=normalize(vec3f(-slope.x,1.0,-slope.y));let NoV=max(0.01,dot(N,V));
    let variance=max(vec2f(0.0),s0.zw-s0.xy*s0.xy)+max(vec2f(0.0),s1.zw-s1.xy*s1.xy)+max(vec2f(0.0),s2.zw-s2.xy*s2.xy)+max(vec2f(0.0),s3.zw-s3.xy*s3.xy);
    let dx=dpdx(N);let dy=dpdy(N);let rough=clamp(0.025+sqrt(variance.x+variance.y+0.15*(dot(dx,dx)+dot(dy,dy))),0.035,0.4);
    let fresnel=0.0204+0.9796*pow(1.0-NoV,5.0);let R=reflect(-V,N);
    var reflected=sky_radiance(R);
    let projected=uniforms.reflectionMatrix*vec4f(f.world,1.0);let ruv=projected.xy/max(0.001,projected.w);
    let mirrorUV=vec2f(ruv.x,1.0-ruv.y)+N.xz*0.015;
    let mirror=textureSampleLevel(reflection,reflection_sampler,mirrorUV,rough*6.0);
    let inMirror=step(0.0,mirrorUV.x)*step(mirrorUV.x,1.0)*step(0.0,mirrorUV.y)*step(mirrorUV.y,1.0)*step(0.0,projected.w);
    reflected=mix(reflected,mirror.rgb/max(0.001,mirror.a),mirror.a*inMirror*uniforms.reflectOn);
    let waterDepth=view_depth(f.world);let bed=textureSampleLevel(depth,depth_sampler,uv,0.0).r;
    let thickness=clamp(bed-waterDepth,0.0,160.0);let tint=exp(-vec3f(0.30,0.075,0.035)*thickness);
    let offset=N.xz*min(0.016,thickness*0.001)/max(0.5,NoV);
    let refrUV=clamp(uv+offset,vec2f(0.001),vec2f(0.999));
    let refrDepth=textureSampleLevel(depth,depth_sampler,refrUV,0.0).r;
    let valid=step(waterDepth,refrDepth);let refracted=textureSampleLevel(behind,behind_sampler,mix(uv,refrUV,valid),0.0).rgb;
    let shore=shore_distance(p);let shallow=1.0-smoothstep(0.0,35.0,shore);
    let scatter=mix(vec3f(0.006,0.068,0.105),vec3f(0.025,0.23,0.19),shallow)*(0.12+uniforms.day*0.88)*(1.0-uniforms.storm*0.45);
    var color=mix(refracted,scatter,1.0-tint)*(1.0-fresnel)+reflected*fresnel;
    let L=uniforms.sunDir;let H=normalize(V+L);let NoH=max(0.0,dot(N,H));let NoL=max(0.0,dot(N,L));let VoH=max(0.0,dot(V,H));
    let a2=rough*rough;let den=NoH*NoH*(a2-1.0)+1.0;let D=a2/(3.14159*den*den);
    let Gv=NoV+sqrt(a2+(1.0-a2)*NoV*NoV);let Gl=NoL+sqrt(a2+(1.0-a2)*NoL*NoL);
    let F=0.0204+0.9796*pow(1.0-VoH,5.0);
    var cloudLight=1.0;
    for(var i=0;i<16;i++){let c=uniforms.clouds[i];if(c.w<=0.0){break;}let cp=f.world.xz+uniforms.cloudSun.xz*(180.0-f.world.y)/max(0.1,uniforms.cloudSun.y);let cd=length((cp-c.xy)/vec2f(c.z,c.z*.8));cloudLight=cloudLight*(1.0-(1.0-smoothstep(.25,1.0,cd))*c.w);}
    color=color+uniforms.sunRadiance*float_shadow(f.world)*max(.18,cloudLight)*min(80.0,D*F/max(0.001,Gv*Gl))*NoL;
    let crest=max(0.0,f.v0.z)*pow(max(0.0,dot(-V,L)),3.0);
    color=color+vec3f(0.02,0.17,0.13)*crest*uniforms.sunRadiance;
    let turbulence=min(ocean_bilinear(0,p).w,min(ocean_bilinear(1,p).w,ocean_bilinear(2,p).w));
    let breaker=1.0-smoothstep(0.28,0.8,turbulence);
    let shoreFoam=(1.0-smoothstep(0.0,3.8,abs(shore-1.4)))*(0.45+0.55*sin(shore*2.2-uniforms.time*1.6));
    let foam=clamp((breaker*.8+shoreFoam+wake_foam(p))*foam_noise(p+uniforms.time*.18),0.0,0.95);
    color=mix(color,vec3f(0.65,0.78,0.75)*(0.15+uniforms.day*0.85),foam);
    for(var q=0;q<8;q++){let fish=uniforms.shoals[q];let mask=(1.0-smoothstep(fish.z*.35,max(0.01,fish.z*1.3),length(p-fish.xy)))*step(0.01,fish.z);color=color*(1.0-mask*.26);}
    let fog=1.0-exp(-length(camera_position()-f.world)*mix(0.00032,0.0014,uniforms.storm));
    color=mix(color,sky_radiance(normalize(f.world-camera_position())),fog);
    return vec4f(color,1.0);
   }`});
  this.mesh=new Mesh(grid(profile.oceanSegments),this.material);this.mesh.noAO=true;this.mesh.frustumCulled=false;this.mesh.renderOrder=2;this.mesh.castShadow=false;scene.add(this.mesh);
 }
 update(dt:number,time:number,camera:any,storm:boolean,wind:number,knots:number,hidden:Mesh[],bodies:WaveBody[]){
  if(!this.mesh.visible)return;
  const weather=Math.round(knots/4)+':'+Math.round(wind*3)+':'+storm;
  if(weather!==this.weatherKey){this.weatherKey=weather;Object.assign(this.sim.params,{windSpeed:Math.max(3,Math.min(16,knots*.514)),windDirection:90-wind*180/Math.PI,waveScale:storm?1.1:.6});this.sim.dirty=true;}
  this.sim.update(dt);this.probe.update(bodies);this.material.uniforms.displacement!.value=this.sim.displacement;this.material.uniforms.time!.value=time;
  (this.material.uniforms.centre!.value as Vector2).set(camera.position.x,camera.position.z);
  const show=this.mesh.visible;
  if(!show)return;
  const casters:{pos:Vector3,radius:number}[]=[];
  scene.traverse(o=>{if(o.userData.waterCaster&&o.visible&&o.position.distanceTo(camera.position)<1000)casters.push({pos:o.position,radius:25});});
  this.shadow.update(casters,this.skyDirection());
  this.reflection.setSize(frameSize.x,frameSize.y);this.material.uniforms.reflection!.value=this.reflection.target.texture;
  const excluded=[this.mesh,...hidden],visibility=excluded.map(m=>m.visible);
  try{for(const m of excluded)m.visible=false;this.reflection.render(scene,camera);this.material.uniforms.reflectOn!.value=1;}
  finally{excluded.forEach((m,i)=>m.visible=visibility[i]);}
 }
 private skyDirection(){return this.material.uniforms.sunDir!.value as Vector3;}
 dispose(){this.probe.dispose();this.shadow.dispose();scene.remove(this.mesh);this.mesh.geometry.dispose();this.material.dispose();this.sim.dispose();this.reflection.dispose();}
}
// Updated from frame() by the controller; never read a browser window.
export const frameSize=new Vector2(1,1);
