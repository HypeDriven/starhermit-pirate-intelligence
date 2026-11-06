import {scene,Mesh,SphereGeometry,ShaderMaterial,BackSide,Vector3,Color,DataTexture,FloatType,PMREMGenerator,renderer} from 'starhermit:scene';

// Shared analytic radiance for the dome, sea reflection and aerial scattering.
export const SKY_WGSL=`
fn sky_radiance(ray: vec3f) -> vec3f {
 let d=normalize(ray); let h=max(d.y,0.0); let mu=max(dot(d,uniforms.sunDir),0.0);
 let day=uniforms.day; let dusk=pow(1.0-day,2.0)*smoothstep(0.0,0.15,day);
 let horizon=mix(vec3f(0.018,0.030,0.065),vec3f(0.38,0.62,0.78),day);
 let zenith=mix(vec3f(0.002,0.005,0.022),vec3f(0.045,0.23,0.49),day);
 var c=mix(horizon,zenith,pow(h,0.42));
 c=c+vec3f(0.85,0.22,0.045)*dusk*pow(1.0-h,5.0)*pow(mu,3.0);
 let mie=0.018/(pow(max(0.035,1.0+0.76*0.76-1.52*mu),1.5));
 c=c+uniforms.sunRadiance*(mie+smoothstep(0.99990,0.99997,mu)*12.0);
 let moon=max(dot(d,normalize(vec3f(-0.5,0.65,-0.4))),0.0);
 c=c+vec3f(0.24,0.32,0.48)*smoothstep(0.9994,0.9998,moon)*(1.0-day);
 let cell=floor(d*1300.0); let star=fract(sin(dot(cell,vec3f(12.98,78.23,39.42)))*43758.5453);
 c=c+vec3f(0.75,0.82,1.0)*pow(star,220.0)*(1.0-day)*smoothstep(0.03,0.3,h)*0.5;
 return mix(c,mix(vec3f(0.025,0.04,0.065),vec3f(0.16,0.23,0.29),day),uniforms.storm*0.72);
}`;

export class MaritimeSky {
 readonly sunDirection=new Vector3(-.5,.65,.4).normalize();
 readonly radiance=new Vector3(1.8,1.65,1.3);
 readonly uniforms={sunDir:{value:this.sunDirection},sunRadiance:{value:this.radiance},day:{value:1},storm:{value:0}};
 readonly material=new ShaderMaterial({side:BackSide,depthWrite:false,uniforms:this.uniforms,fragmentShader:SKY_WGSL+`
 fn fragment(f: Fragment) -> vec4f {return vec4f(sky_radiance(f.world-camera_position()),1.0);}`});
 readonly dome=new Mesh(new SphereGeometry(2200,32,20),this.material);
 private environment:ReturnType<PMREMGenerator['fromEquirectangular']>|null=null;
 private lastEnvironment=-100;
 day=1; storm=0;
 constructor(){this.dome.noAO=true;this.dome.frustumCulled=false;this.dome.renderOrder=-100;scene.add(this.dome);}
 update(time:number,dt:number,storm:boolean,camera:Vector3){
  const phase=(time%240/240-.25)*Math.PI*2,elevation=Math.sin(phase);
  this.day=Math.max(0,elevation);this.storm+=((storm?1:0)-this.storm)*Math.min(1,dt*.3);
  // A cooler directional moon takes over after sunset.
  this.sunDirection.set(-Math.cos(phase)*.8,Math.max(.10,Math.abs(elevation)),.45).normalize();
  if(this.day<.015)this.sunDirection.set(-.5,.65,-.4).normalize();
  const warmth=Math.max(0,1-this.day*3),c=new Color().setRGB(1,.87-warmth*.39,.65-warmth*.42);
  if(this.day<.015)c.setRGB(.28,.42,.7);
  this.radiance.set(c.r,c.g,c.b).multiplyScalar((this.day<.015?.22:1.4+this.day*1.8)*(1-this.storm*.65));
  this.uniforms.day.value=this.day;this.uniforms.storm.value=this.storm;this.dome.position.copy(camera);
  const key=Math.round(this.day*6)+Math.round(this.storm*2)*10;
  if(key!==this.lastEnvironment){this.lastEnvironment=key;this.updateEnvironment();}
 }
 private updateEnvironment(){
  // Small HDR latitude-longitude sky, prefiltered by the engine for PBR.
  const w=128,h=64,data=new Float32Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const up=Math.cos(y/(h-1)*Math.PI),t=Math.pow(Math.max(0,up),.42),i=(y*w+x)*4;
   const horizon=[.38,.62,.78],zenith=[.045,.23,.49];
   for(let k=0;k<3;k++)data[i+k]=up<0?[.035,.065,.07][k]*(.12+this.day*.5):((horizon[k]*(1-t)+zenith[k]*t)*(.03+this.day*.97))*(1-this.storm*.6);
   data[i+3]=1;
  }
  const texture=new DataTexture(data,w,h,undefined,FloatType);texture.needsUpdate=true;
  const generator=new PMREMGenerator(renderer),old=this.environment;
  this.environment=generator.fromEquirectangular(texture);scene.environment=this.environment.texture;
  old?.dispose();texture.dispose();generator.dispose();
 }
 dispose(){scene.remove(this.dome);this.dome.geometry.dispose();this.material.dispose();this.environment?.dispose();}
}
