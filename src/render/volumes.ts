import {scene,PointLight,Vector3} from 'starhermit:scene';
import {VolumeEffects,VolumeEffect} from 'starhermit:volume';
import {visualProfile} from './quality.js';
import {cloudFields} from './weather.js';

type Profile=ReturnType<typeof visualProfile>;
type Puff={effect:VolumeEffect,vx:number,vz:number,age:number,life:number,flash:PointLight|null};
type Fire={flame:VolumeEffect,smoke:VolumeEffect,light:PointLight,seen:boolean};

export class MaritimeVolumes {
 readonly group=new VolumeEffects();
 private clouds:VolumeEffect[]=[];
 private fog:VolumeEffect[]=[];
 private puffs:Puff[]=[];
 private fires=new Map<string,Fire>();
 private profile:Profile=visualProfile(0);
 private focus=new Vector3();
 private wind=new Vector3();
 constructor(){this.group.noAO=true;scene.add(this.group);}
 configure(profile:Profile){
  this.profile=profile;
  // A level drop must release the old effect budget immediately.
  for(const p of this.puffs){p.effect.dispose();if(p.flash)scene.remove(p.flash);}
  this.puffs=[];
  for(const f of this.fires.values()){f.flame.dispose();f.smoke.dispose();scene.remove(f.light);}
  this.fires.clear();
  for(const c of [...this.clouds,...this.fog]){this.group.remove(c);c.dispose();}
  this.clouds=[];this.fog=[];
  for(const field of cloudFields)field.set(0,0,0,0);
  for(let i=0;i<profile.clouds;i++){
   const c=this.group.create('cloud',[0,160,0],{size:[220+(i%3)*75,65+(i%4)*16,170+(i%2)*65],density:1.3,extinction:.025,noiseScale:90,steps:profile.volumeSteps,shadowSteps:profile.volumeShadows,shadowLength:170,anisotropy:.72,backScatter:-.25,lobeMix:.2,multiScatter:.7,seed:3+i*5});
   c.renderOrder=4;this.clouds.push(c);
  }
  if(profile.index>=5)for(let i=0;i<2;i++){
   const c=this.group.create('fogBank',[0,0,0],{size:[320,24,220],density:.26,extinction:.015,noiseScale:80,steps:Math.max(16,profile.volumeSteps/2),shadowSteps:Math.min(4,profile.volumeShadows),seed:71+i});
   c.renderOrder=5;this.fog.push(c);
  }
 }
 /** Returns true only when a real volume replaced the particle fallback. */
 broadside(x:number,y:number,z:number,dx:number,dz:number,seed:number){
  if(!this.profile.combatVolumes||!this.group.ready)return false;
  const p=this.puff('smoke',x,y-.8,z,seed,6.5,dx*3,dz*3);
  if(!p)return false;
  const flame=this.puff('explosion',x+dx,y-.4,z+dz,seed+10,.32,dx*5,dz*5);
  if(flame){flame.effect.size.set(4,4,4);flame.effect.density=1.3;flame.effect.emission=3;flame.effect.temperatureMin=1300;flame.effect.temperatureMax=2800;}
  if(this.profile.index>=6&&this.puffs.filter(p=>p.flash).length<4){const flash=new PointLight('#ffbd68',120,24,2);flash.position.set(x,y+1,z);scene.add(flash);p.flash=flash;}
  return true;
 }
 impact(x:number,y:number,z:number,seed:number){
  if(!this.profile.combatVolumes||!this.group.ready)return false;
  return !!this.puff('dust',x,y,z,seed,3.5,.4,.2);
 }
 private puff(preset:'smoke'|'explosion'|'dust',x:number,y:number,z:number,seed:number,life:number,vx:number,vz:number){
  // Reuse stopped fields, retaining shared noise and compiled programs.
  let p=this.puffs.find(p=>p.age>=p.life&&p.effect.shape===(preset==='smoke'?'plume':preset==='explosion'?'fireball':'billow'));
  if(!p){
   if(this.puffs.filter(p=>p.age<p.life).length>=this.profile.combatVolumes)return null;
   // Bound the retained pool as well as the live count across tier changes.
   if(this.puffs.length>=30)return null;
   const effect=this.group.create(preset,[x,y,z],{steps:this.profile.volumeSteps,shadowSteps:this.profile.volumeShadows,seed});
   effect.renderOrder=6;p={effect,vx,vz,age:life,life,flash:null};this.puffs.push(p);
  }
  Object.assign(p,{vx,vz,age:0,life});const e=p.effect;e.position.set(x,y,z);e.seed=seed;e.life=life;e.loop=false;e.opacity=1;
  e.steps=this.profile.volumeSteps;e.shadowSteps=this.profile.volumeShadows;
  e.size.set(preset==='smoke'?12:8,preset==='smoke'?14:9,preset==='smoke'?12:8);
  e.wind.copy(this.wind).multiplyScalar(.22);e.density=preset==='smoke'?2.4:1.5;e.extinction=preset==='smoke'?.3:.2;e.albedo.set(preset==='smoke'?'#bdb8a7':'#625849');e.trigger();return p;
 }
 beginShips(){for(const f of this.fires.values())f.seen=false;}
 shipFire(id:string,x:number,z:number,heading:number,fire:number,visible:boolean){
  let f=this.fires.get(id);
  if(fire<=0||!visible||!this.profile.fireVolumes||Math.hypot(x-this.focus.x,z-this.focus.z)>500)return;
  if(!f){
   if(this.fires.size>=this.profile.fireVolumes)return;
   const opts={steps:this.profile.volumeSteps,shadowSteps:this.profile.volumeShadows,seed:this.fires.size*7+9};
   const flame=this.group.create('fire',[x,4,z],{...opts,size:[8,13,11],density:2,emission:2.1,temperature:[900,2400]});
   const smoke=this.group.create('smoke',[x,6,z],{...opts,size:[16,35,16],density:2.1,extinction:.20,albedo:'#302c29',noiseScale:9});
   flame.renderOrder=6;smoke.renderOrder=7;const light=new PointLight('#ff9b42',0,45,2);scene.add(light);
   f={flame,smoke,light,seen:true};this.fires.set(id,f);
  }
  f.seen=true;const intensity=Math.min(1,fire/65+.25);f.flame.position.set(x,4,z);f.smoke.position.set(x,6,z);
  f.flame.rotation.y=heading;f.flame.opacity=intensity;f.smoke.opacity=intensity*.85;
  f.flame.wind.copy(this.wind).multiplyScalar(.12);f.smoke.wind.copy(this.wind).multiplyScalar(.3);
  f.light.position.set(x,8,z);f.light.intensity=intensity*(65+Math.sin(f.flame.age*17)*12);
 }
 update(dt:number,time:number,focus:{x:number,z:number},wind:number,knots:number,storm:boolean,zoom:number,visible:boolean){
  this.focus.set(focus.x*10,0,focus.z*10);this.wind.set(Math.sin(wind),0,Math.cos(wind)).multiplyScalar(knots*.514);
  this.group.visible=visible;
  for(let i=0;i<this.clouds.length;i++){
   const c=this.clouds[i],a=i*2.39996,r=260+Math.sqrt(i)*210;
   c.position.set(this.focus.x+Math.cos(a)*r+Math.sin(time*.004+i)*40,150+(i%3)*45,this.focus.z+Math.sin(a)*r);
   c.wind.copy(this.wind).multiplyScalar(.35);c.density=storm?2.5:1.3;c.opacity=(.15+.85*zoom)*(storm?.98:.88);c.extinction=storm?.045:.025;
   cloudFields[i].set(c.position.x,c.position.z,c.size.x*.5,storm?.7:.45);
  }
  for(let i=0;i<this.fog.length;i++){
   const c=this.fog[i];c.position.set(this.focus.x+(i?220:-270),-1,this.focus.z+(i?-100:180));c.opacity=(storm?.5:.08)*zoom;c.wind.copy(this.wind).multiplyScalar(.08);
  }
  for(const p of this.puffs){
   p.age+=dt;if(p.age>=p.life)p.effect.visible=false;
   else{p.effect.position.x+=(p.vx+this.wind.x*.15)*dt;p.effect.position.z+=(p.vz+this.wind.z*.15)*dt;p.effect.opacity=Math.min(1,(p.life-p.age)*.8);}
   if(p.flash){p.flash.intensity=120*Math.max(0,1-p.age/.18);if(p.age>.2){scene.remove(p.flash);p.flash=null;}}
  }
  for(const [id,f] of this.fires)if(!f.seen){this.group.remove(f.flame,f.smoke);f.flame.dispose();f.smoke.dispose();scene.remove(f.light);this.fires.delete(id);}
  this.group.update(dt);
 }
 dispose(){for(const p of this.puffs)if(p.flash)scene.remove(p.flash);for(const f of this.fires.values())scene.remove(f.light);scene.remove(this.group);this.group.dispose();}
}
export const maritimeVolumes=new MaritimeVolumes();
