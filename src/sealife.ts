// Sea life: whales on slow loops through open water, dolphin pods that roam and
// ride the bow wave of a nearby ship under way, and fish shoals (the
// authority's fishing grounds) that boil the surface while fish leap from them.
// Purely presentation. Whales follow the shared sea clock, so every captain sees
// them in the same place; dolphins react to whatever ship is closest.
import {scene,Group,MeshStandardMaterial,MeshBasicMaterial} from 'starhermit:scene';
import {METRES} from './navigation.js';
import {box,sphere} from './visuals.js';

const SEA=-2.1;
type Whale={g:any,tail:any,cx:number,cz:number,r:number,speed:number,offset:number,spout:any[]};
type Dolphin={g:any,phase:number,x:number,z:number,heading:number,lane:number};
type Pod={members:Dolphin[],cx:number,cz:number,r:number,speed:number,offset:number,x:number,z:number,heading:number,riding:any};
const whales:Whale[]=[],pods:Pod[]=[],leapers:any[]=[],splashes:any[]=[];

function whaleModel(){
 const g=new Group(),dark='#344651',belly='#b9c2c2';
 const body=sphere(g,0,0,0,1,dark);body.scale.set(2.1,1.7,7);const under=sphere(g,0,-.55,.8,1,belly);under.scale.set(1.8,1.1,5.4);
 sphere(g,0,.2,5.2,1,dark).scale.set(1.5,1.2,2.4);for(let k=0;k<6;k++)box(g,0,-1.05,2+k*.7,1.2-k*.12,.06,.1,'#8e9a9c');
 for(const s of [-1,1]){const fin=sphere(g,s*2.4,-.6,2.6,1,dark);fin.scale.set(2.2,.18,.7);fin.rotation.y=s*.5;fin.rotation.z=s*.35;sphere(g,s*1.25,.35,4.4,.13,'#11181c');}
 sphere(g,0,1.45,-2.2,1,dark).scale.set(.18,.45,.6);
 // Tail stock and flukes pivot at the body's end so they can rise for a dive.
 const tail=new Group();tail.position.set(0,0,-6.2);g.add(tail);sphere(tail,0,0,-1.6,1,dark).scale.set(.9,.8,2.4);
 for(const s of [-1,1]){const f=sphere(tail,s*1.5,0,-3.8,1,dark);f.scale.set(1.9,.16,.85);f.rotation.y=-s*.35;const w=sphere(tail,s*1.5,-.05,-3.8,1,'#d7dbd6');w.scale.set(1.6,.14,.6);w.rotation.y=-s*.35;}
 g.scale.set(1.15,1.15,1.15);g.rotation.order='YXZ';return {g,tail};
}
function dolphinModel(){
 const g=new Group(),grey='#6b8592';
 const b=sphere(g,0,0,0,1,grey);b.scale.set(.36,.4,1.3);sphere(g,0,-.12,.15,1,'#d6dfe0').scale.set(.3,.28,1.05);
 sphere(g,0,-.05,1.35,1,grey).scale.set(.13,.12,.42);const fin=box(g,0,.45,-.1,.06,.42,.42,grey);fin.rotation.x=-.6;
 for(const s of [-1,1]){const fl=box(g,s*.32,-.18,.45,.4,.04,.18,grey);fl.rotation.z=s*.5;const fk=box(g,s*.26,0,-1.32,.48,.04,.24,grey);fk.rotation.y=s*.4;sphere(g,s*.2,.08,.88,.04,'#111');}
 g.rotation.order='YXZ';return g;
}
function fishModel(){const g=new Group();const b=sphere(g,0,0,0,1,'#c7d6da');b.scale.set(.09,.16,.42);b.material=new MeshStandardMaterial({color:'#c9dade',metalness:.6,roughness:.25});box(g,0,0,-.45,.02,.24,.16,'#9fb4ba');g.rotation.order='YXZ';return g;}

export function createSeaLife(){
 const routes=[[-20,-140,230,3.2],[160,190,170,2.6],[-260,10,190,2.9]];
 routes.forEach(([cx,cz,r,speed],i)=>{const {g,tail}=whaleModel();scene.add(g);const spout:any[]=[];for(let k=0;k<7;k++){const m=sphere(scene,0,0,0,1,'#ffffff');m.material=new MeshBasicMaterial({color:'#eef6f6',transparent:true,opacity:.5,depthWrite:false});m.castShadow=false;m.visible=false;spout.push(m);}whales.push({g,tail,cx,cz,r,speed,offset:i*19,spout});});
 const podRoutes=[[60,40,200,9],[-150,-120,170,8],[120,-200,210,10]];
 podRoutes.forEach(([cx,cz,r,speed],i)=>{const members:Dolphin[]=[];for(let k=0;k<4;k++){const g=dolphinModel();scene.add(g);members.push({g,phase:k*.9+i,x:0,z:0,heading:0,lane:k});}pods.push({members,cx,cz,r,speed,offset:i*2.1,x:cx+r,z:cz,heading:0,riding:null});});
 for(let k=0;k<14;k++){const g=fishModel();g.visible=false;scene.add(g);leapers.push({g,age:9,life:1,x:0,z:0,dx:0,dz:0,h:1});}
 for(let k=0;k<16;k++){const m=sphere(scene,0,0,0,1,'#ffffff');m.material=new MeshBasicMaterial({color:'#e8f4f2',transparent:true,opacity:.6,depthWrite:false});m.castShadow=false;m.visible=false;splashes.push({m,age:9,life:.6,vx:0,vy:0,vz:0});}
}
function splash(x:number,z:number,size=1){let n=0;for(const s of splashes){if(s.age<s.life)continue;s.age=0;s.life=.5+size*.2;s.m.visible=true;s.m.position.set(x,SEA+.2,z);const a=n*2.4;s.vx=Math.cos(a)*1.4*size;s.vz=Math.sin(a)*1.4*size;s.vy=2.2*size;if(++n===4)break;}}

/** time: the shared sea clock (seconds); ships: world-metre poses with way 0..1; shoals: authority units. */
export function animateSeaLife(time:number,dt:number,focus:{x:number,z:number},ships:{x:number,z:number,heading:number,way:number}[],shoals:{x:number,z:number,r:number}[]){
 const fx=focus.x*METRES,fz=focus.z*METRES;
 // Whales: a 50 s cycle of surfacing, blowing, cruising, then a fluke-up dive.
 for(const w of whales){const a=(time*w.speed)/w.r+w.offset,x=w.cx+Math.cos(a)*w.r,z=w.cz+Math.sin(a)*w.r,c=((time+w.offset*3)%50+50)%50;
  let y=-9,pitch=0,tail=0;
  if(c<5){y=-9+c/5*6.8;pitch=-.12*(1-c/5);}
  else if(c<28){y=-2.2-Math.sin(c*.8)*.15;tail=Math.sin(c*.9)*.12;}
  else if(c<35){const u=(c-28)/7;y=-2.2-u*u*7;pitch=Math.sin(Math.min(1,u*1.4)*Math.PI/2)*.75;tail=u*.5;}
  w.g.visible=c<36&&Math.hypot(x-fx,z-fz)<900;w.g.position.set(x,y,z);w.g.rotation.set(pitch,-a,0);w.tail.rotation.x=tail;
  // The blow: a column of mist from the blowhole at each surfacing breath.
  const blow=[6,13,20].find(t=>c>=t&&c<t+2.2);for(let k=0;k<w.spout.length;k++){const m=w.spout[k];if(blow===undefined||!w.g.visible){m.visible=false;continue;}const u=(c-blow)/2.2,h=k/w.spout.length;m.visible=true;const fwd=Math.sin(-a),fwdz=Math.cos(-a);m.position.set(x+fwd*4.5+Math.sin(k*2.1)*u*1.2,y+1.6+h*7*Math.min(1,u*3),z+fwdz*4.5+Math.cos(k*1.7)*u*1.2);const s=.5+h*1.4+u*1.2;m.scale.set(s,s,s);m.material.opacity=.55*(1-u)*(1-h*.4);}
  if(c>=4.6&&c<4.6+dt)splash(x,z,1.6);if(c>=31&&c<31+dt)splash(x-Math.sin(-a)*8,z-Math.cos(-a)*8,1.4);}
 // Dolphins: roam a loop, but join the nearest ship under way and ride her bow.
 for(const p of pods){let target:any=null,best=160;for(const s of ships){if(s.way<.2)continue;const d=Math.hypot(s.x-p.x,s.z-p.z);if(d<best){best=d;target=s;}}
  if(target){const fx2=Math.sin(target.heading),fz2=Math.cos(target.heading),tx=target.x+fx2*16,tz=target.z+fz2*16,dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz),sp=Math.max(10,target.way*20+6);if(d>.5){p.x+=dx/d*Math.min(d,sp*dt*1.4);p.z+=dz/d*Math.min(d,sp*dt*1.4);}p.heading+=Math.atan2(Math.sin(target.heading-p.heading),Math.cos(target.heading-p.heading))*Math.min(1,dt*2);}
  else{const a=(time*p.speed)/p.r+p.offset,tx=p.cx+Math.cos(a)*p.r,tz=p.cz+Math.sin(a)*p.r,dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz);if(d>.5){p.x+=dx/d*Math.min(d,p.speed*dt*1.3);p.z+=dz/d*Math.min(d,p.speed*dt*1.3);}const want=Math.atan2(-Math.sin(a),Math.cos(a));p.heading+=Math.atan2(Math.sin(want-p.heading),Math.cos(want-p.heading))*Math.min(1,dt*1.5);}
  const near=Math.hypot(p.x-fx,p.z-fz)<700,fw={x:Math.sin(p.heading),z:Math.cos(p.heading)},side={x:Math.cos(p.heading),z:-Math.sin(p.heading)};
  for(const m of p.members){const lane=(m.lane%2?1:-1)*(3+Math.floor(m.lane/2)*3.5),ahead=Math.sin(time*.7+m.lane*1.3)*2.5-Math.floor(m.lane/2)*3;m.x=p.x+side.x*lane+fw.x*ahead;m.z=p.z+side.z*lane+fw.z*ahead;
   // Leap cycle: a low arc clear of the water, then a stretch just under it.
   const cycle=2.6+m.lane*.17,u=((time+m.phase)%cycle)/cycle,leap=u<.42?u/.42:-1;let y=SEA-1.2,pitch=0;
   if(leap>=0){y=SEA-.5+Math.sin(leap*Math.PI)*1.9;pitch=-Math.cos(leap*Math.PI)*.75;}
   m.g.visible=near&&y>SEA-.9;m.g.position.set(m.x,y,m.z);m.g.rotation.set(pitch,p.heading,0);
   const pu=((time-dt+m.phase)%cycle)/cycle,prevLeap=pu<.42?pu/.42:-1;if(near&&prevLeap>=0&&prevLeap<.9&&(leap>=.9||leap<0))splash(m.x+fw.x*1.2,m.z+fw.z*1.2,.7);}}
 // Fish leap out of nearby shoals.
 for(const f of leapers){if(f.age>=f.life){f.g.visible=false;continue;}f.age+=dt;const u=Math.min(1,f.age/f.life);f.g.visible=true;f.g.position.set(f.x+f.dx*u,SEA-.2+Math.sin(u*Math.PI)*f.h,f.z+f.dz*u);f.g.rotation.set(-Math.cos(u*Math.PI)*.9,Math.atan2(f.dx,f.dz),Math.sin(f.age*20)*.2);if(u>=1)splash(f.x+f.dx,f.z+f.dz,.35);}
 for(const sh of shoals){const x=sh.x*METRES,z=sh.z*METRES;if(Math.hypot(x-fx,z-fz)>420)continue;if(Math.random()<dt*2.2){const f=leapers.find(f=>f.age>=f.life);if(f){const a=Math.random()*Math.PI*2,r=Math.random()*sh.r*METRES*.8,h=Math.random()*Math.PI*2;f.x=x+Math.cos(a)*r;f.z=z+Math.sin(a)*r;f.dx=Math.sin(h)*2.2;f.dz=Math.cos(h)*2.2;f.h=.8+Math.random()*.9;f.age=0;f.life=.55+Math.random()*.3;splash(f.x,f.z,.3);}}}
 for(const s of splashes){if(s.age>=s.life){s.m.visible=false;continue;}s.age+=dt;s.vy-=9*dt;s.m.position.x+=s.vx*dt;s.m.position.y=Math.max(SEA,s.m.position.y+s.vy*dt);s.m.position.z+=s.vz*dt;const k=.18+s.age*.5;s.m.scale.set(k,k,k);s.m.material.opacity=.6*(1-s.age/s.life);}
}
