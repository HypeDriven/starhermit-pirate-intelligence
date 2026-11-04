// Battle presentation. Everything here is drawn from the authority's shots,
// effects and loot; nothing in this file decides a hit, a reward or a reload.
import {scene,Group,Mesh,SphereGeometry,BoxGeometry,CylinderGeometry,RingGeometry,TorusGeometry,MeshBasicMaterial,MeshStandardMaterial,DoubleSide} from 'starhermit:scene';
import {METRES} from './navigation.js';
import {cue} from './sound.js';

const SEA=-2.1,DECK=4.3,HULL_Y=1.6;
const ballGeo=new SphereGeometry(1,10,8),puffGeo=new SphereGeometry(1,8,6),chipGeo=new BoxGeometry(1,1,1),columnGeo=new CylinderGeometry(.55,1,1,10,1,true);
const ballMat=new MeshStandardMaterial({color:'#262a2b',roughness:.45,metalness:.6});

type Particle={m:any,vx:number,vy:number,vz:number,age:number,life:number,grow:number,gravity:number,spin:number,fade:number,base:number};
const pool:Particle[]=[];
function particle(color:string,geo=puffGeo){
 for(const p of pool)if(p.age>=p.life&&p.m.geometry===geo){p.m.material.color.set(color);return p;}
 if(pool.length>=220)return null;
 const m=new Mesh(geo,new MeshBasicMaterial({color,transparent:true,opacity:1,depthWrite:false}));m.castShadow=false;m.visible=false;scene.add(m);
 const p={m,vx:0,vy:0,vz:0,age:1,life:0,grow:0,gravity:0,spin:0,fade:1,base:1};pool.push(p);return p;
}
function emit(color:string,x:number,y:number,z:number,o:{size:number,life:number,vx?:number,vy?:number,vz?:number,grow?:number,gravity?:number,spin?:number,opacity?:number,geo?:any}){
 const p=particle(color,o.geo||puffGeo);if(!p)return;
 p.age=0;p.life=o.life;p.vx=o.vx||0;p.vy=o.vy||0;p.vz=o.vz||0;p.grow=o.grow||0;p.gravity=o.gravity||0;p.spin=o.spin||0;p.fade=o.opacity??.85;p.base=o.size;
 p.m.position.set(x,y,z);p.m.scale.set(o.size,o.size,o.size);p.m.rotation.set(0,0,0);p.m.material.opacity=p.fade;p.m.visible=true;
}
function rand(seed:number){const x=Math.sin(seed*12.9898)*43758.5453;return x-Math.floor(x);}

// Shots in flight, keyed by the authority's id.
const balls:any={};
// Floating words: damage, rakes, loot, warnings.
const floaters:{text:string,color:string,x:number,y:number,z:number,age:number,life:number,big:boolean}[]=[];
function say(text:string,color:string,x:number,z:number,big=false,life=1.8){floaters.push({text,color,x:x*METRES,y:12,z:z*METRES,age:0,life,big});if(floaters.length>16)floaters.shift();}

// Loot barrels bobbing where a ship went down.
const crates:any={};
function lootMesh(kind:string){
 const g=new Group();const wood=new MeshStandardMaterial({color:kind==='gold'?'#7a5631':'#9c7448',roughness:.8});
 const body=new Mesh(new CylinderGeometry(.55,.55,1.2,10),wood);body.rotation.z=Math.PI/2;g.add(body);
 for(const x of [-.4,.4]){const band=new Mesh(new CylinderGeometry(.58,.58,.1,10),new MeshStandardMaterial({color:'#3c3a33'}));band.rotation.z=Math.PI/2;band.position.x=x;g.add(band);}
 if(kind==='gold'){const glint=new Mesh(puffGeo,new MeshBasicMaterial({color:'#ffd77a'}));glint.scale.set(.25,.25,.25);glint.position.y=.7;g.add(glint);}
 const halo=new Mesh(new TorusGeometry(1.6,.09,6,28),new MeshBasicMaterial({color:'#ffd77a',transparent:true,opacity:.6,depthWrite:false}));halo.rotation.x=Math.PI/2;g.add(halo);g.userData.halo=halo;
 g.scale.set(1.6,1.6,1.6);scene.add(g);return g;
}

// Broadside arcs: the player's own batteries, and a raider's laid guns.
// A thin band at the guns' 170 m reach across the broadside arc, and a faint wedge inside it.
function arcMesh(color:string){
 const band=new Mesh(new RingGeometry(162,170,40,1,-Math.PI*.35,Math.PI*.7),new MeshBasicMaterial({color,transparent:true,opacity:.3,depthWrite:false,side:DoubleSide}));
 const fill=new Mesh(new RingGeometry(20,162,40,1,-Math.PI*.35,Math.PI*.7),new MeshBasicMaterial({color,transparent:true,opacity:.03,depthWrite:false,side:DoubleSide}));
 const ring=new Group();ring.add(band,fill);ring.rotation.x=-Math.PI/2;const g=new Group();g.add(ring);g.visible=false;scene.add(g);g.userData.ring=ring;g.userData.band=band;g.userData.fill=fill;return g;
}
function arcLook(arc:any,color:string,band:number,fill:number){arc.userData.band.material.color.set(color);arc.userData.fill.material.color.set(color);arc.userData.band.material.opacity=band;arc.userData.fill.material.opacity=fill;}
const ownArcs={port:arcMesh('#a8cea0'),starboard:arcMesh('#a8cea0')};
(ownArcs.starboard.userData.ring as any).rotation.z=Math.PI;
const threat:any={};

let lastFx=-1,shake=0;
export function cameraShake(){return shake;}

/** Battle in view: anything firing, landing, threatening or floating nearby. */
export function inBattle(state:any,me:string){
 const s=state?.myShip;if(!s)return false;
 return state.raiders.some((e:any)=>e.hull>0&&(e.ai==='engage'||e.ai==='flee')&&Math.hypot(e.x-s.x,e.z-s.z)<26)||state.shots?.length>0||state.fx?.some((f:any)=>state.time-f.at<4&&(f.by===me||f.target===me));
}

export function combatUpdate(state:any,me:string,now:number,dt:number,poses:any,_ships:any){
 if(!state)return;const s=state.myShip;
 // Effects: handle each once, and never replay history after a (re)connect.
 const fx=state.fx||[];
 if(lastFx<0){lastFx=fx.reduce((m:number,f:any)=>Math.max(m,f.id),0);}
 for(const f of fx){if(f.id<=lastFx)continue;lastFx=Math.max(lastFx,f.id);if(now-f.at<2.5)effect(f,state,me);}
 // Cannonballs follow the authority's flight: launch point, landing point, times.
 const live:any={};
 for(const shot of state.shots||[]){
  live[shot.id]=true;let b=balls[shot.id];
  if(!b){const m=new Mesh(ballGeo,ballMat);m.castShadow=false;const r=shot.by===me?.55:.5;m.scale.set(r,r,r);scene.add(m);b=balls[shot.id]={m,trail:0};}
  const u=Math.max(0,Math.min(1,(now-shot.fired)/Math.max(.1,shot.lands-shot.fired))),dist=Math.hypot(shot.tx-shot.x,shot.tz-shot.z)*METRES;
  const x=(shot.x+(shot.tx-shot.x)*u)*METRES,z=(shot.z+(shot.tz-shot.z)*u)*METRES,y=DECK+(HULL_Y-DECK)*u+Math.sin(u*Math.PI)*(3+dist*.07);
  b.m.position.set(x,y,z);b.trail+=dt;
  if(b.trail>.05){b.trail=0;emit('#d9d6c8',x,y,z,{size:.3,life:.45,grow:1.2,opacity:.35});}
  if(s&&shot.by!==me&&!b.whistled&&u>.4&&Math.hypot(shot.tx-s.x,shot.tz-s.z)<3){b.whistled=true;cue('shot-whistle',.7);}
 }
 for(const id of Object.keys(balls))if(!live[id]){scene.remove(balls[id].m);delete balls[id];}
 // Loot.
 const floating:any={};
 for(const l of state.loot||[]){floating[l.id]=true;const g=crates[l.id]||(crates[l.id]=lootMesh(l.kind));
  g.position.set(l.x*METRES,SEA+.2+Math.sin(now*1.7+l.id)*.25,l.z*METRES);g.rotation.y=now*.3+l.id;g.rotation.z=Math.sin(now*1.3+l.id)*.15;
  g.userData.halo.material.opacity=.35+.3*Math.sin(now*4+l.id);g.userData.halo.rotation.z=-g.rotation.y;}
 for(const id of Object.keys(crates))if(!floating[id]){scene.remove(crates[id]);delete crates[id];}
 // The player's battery arcs, while a fight is on: bright when loaded.
 const fighting=inBattle(state,me),pose=s&&(poses[s.id]||s);
 for(const side of ['port','starboard'] as const){const arc=ownArcs[side];arc.visible=!!(fighting&&s&&!s.away);if(!arc.visible)continue;
  arc.position.set(pose.x*METRES,SEA+.9,pose.z*METRES);arc.rotation.y=pose.heading||0;const ready=state.time>=(s.reload?.[side]||0);
  arcLook(arc,ready?'#a8cea0':'#6e8783',ready?.32:.1,ready?.025:0);}
 // A raider that has run out its guns shows where they are laid.
 for(const e of state.raiders){let t=threat[e.id];const aiming=e.hull>0&&e.aim&&e.aim.target===me;
  if(!t&&aiming){t=threat[e.id]=arcMesh('#e9604a');}
  if(!t)continue;t.visible=!!aiming;if(!aiming)continue;
  const p=poses[e.id]||e,left=Math.max(0,e.aim.until-now);t.position.set(p.x*METRES,SEA+1,p.z*METRES);t.rotation.y=p.heading||0;
  t.userData.ring.rotation.z=e.aim.side==='port'?0:Math.PI;const pulse=.5+.5*Math.sin(now*(10+8*(1-left/1.6)));arcLook(t,'#e9604a',.35+.4*pulse,.04+.06*pulse);}
 // Particles and words.
 for(const p of pool){if(p.age>=p.life)continue;p.age+=dt;if(p.age>=p.life){p.m.visible=false;continue;}
  p.vy-=p.gravity*dt;p.m.position.x+=p.vx*dt;p.m.position.y+=p.vy*dt;p.m.position.z+=p.vz*dt;
  if(p.m.position.y<SEA&&p.gravity>0){p.age=p.life;p.m.visible=false;continue;}
  const k=p.base*(1+p.grow*p.age);p.m.scale.set(k,p.m.geometry===columnGeo?p.base*3*(1-p.age/p.life)+.1:k,k);if(p.spin){p.m.rotation.x+=p.spin*dt;p.m.rotation.z+=p.spin*.7*dt;}
  p.m.material.opacity=p.fade*(1-p.age/p.life);}
 for(let i=floaters.length-1;i>=0;i--){const f=floaters[i];f.age+=dt;f.y+=dt*4;if(f.age>f.life)floaters.splice(i,1);}
 shake=Math.max(0,shake-dt*2.2);
}

function sideOffset(ship:any,side:string){const sign=side==='port'?1:-1;return {x:Math.cos(ship.heading)*sign,z:-Math.sin(ship.heading)*sign,fx:Math.sin(ship.heading),fz:Math.cos(ship.heading)};}
function near(state:any,x:number,z:number){const s=state.myShip;return s?Math.max(.12,1-Math.hypot(x-s.x,z-s.z)/45):.5;}
function effect(f:any,state:any,me:string){
 const x=f.x*METRES,z=f.z*METRES,seed=f.id;
 if(f.kind==='volley'){
  const ship=state.ships.concat(state.raiders).find((o:any)=>o.id===f.by)||f,o=sideOffset({heading:ship.heading||0},f.side);
  cue('cannon-fire',near(state,f.x,f.z));
  for(let g=-1;g<=1;g++){const gx=x+(o.fx*g*.7+o.x*.55)*METRES,gz=z+(o.fz*g*.7+o.z*.55)*METRES;
   emit('#ffd27a',gx+o.x*1.4,DECK,gz+o.z*1.4,{size:.8,life:.12,grow:3,opacity:1});
   for(let k=0;k<3;k++)emit(k%2?'#cfcabd':'#e8e3d6',gx+o.x*(1.5+k*1.2),DECK+k*.3,gz+o.z*(1.5+k*1.2),{size:.6+k*.2,life:1.6+rand(seed+g+k)*.6,vx:o.x*(5-k)+(rand(seed*3+k)-.5),vy:.9,vz:o.z*(5-k),grow:.9,opacity:.26});}
 }
 else if(f.kind==='splash'){
  if(near(state,f.x,f.z)>.45)cue('shot-splash',near(state,f.x,f.z)*.8);
  emit('#eef7f4',x,SEA+.4,z,{size:1.1,life:.9,opacity:.9,geo:columnGeo});
  for(let k=0;k<9;k++){const a=k/9*Math.PI*2;emit('#f4fbf8',x,SEA+.5,z,{size:.35+rand(seed+k)*.3,life:1.2,vx:Math.cos(a)*2.5,vy:9+rand(seed*2+k)*6,vz:Math.sin(a)*2.5,gravity:22,opacity:.95});}
  emit('#d6ece8',x,SEA+.3,z,{size:1,life:1.2,grow:1.6,opacity:.4});
 }
 else if(f.kind==='hit'||f.kind==='rake'){
  const mine=f.target===me,rake=f.kind==='rake';cue('hull-impact',near(state,f.x,f.z));if(mine)shake=Math.min(1.2,shake+(rake?.9:.5));
  emit('#ffb050',x,HULL_Y+1,z,{size:1.1,life:.16,grow:3,opacity:1});
  for(let k=0;k<(rake?14:9);k++){const a=rand(seed+k)*Math.PI*2;emit(k%3?'#8a6239':'#c8a06a',x,HULL_Y+1.5,z,{size:.28+rand(seed*5+k)*.3,life:1.4,vx:Math.cos(a)*(4+rand(k)*5),vy:6+rand(seed+k*3)*7,vz:Math.sin(a)*(4+rand(k)*5),gravity:20,spin:9,opacity:1,geo:chipGeo});}
  emit('#5b5650',x,HULL_Y+2,z,{size:.9,life:1.8,vy:1.5,grow:1,opacity:.45});
  const by=f.by===me;say((rake?'RAKED! ':'')+'−'+f.amount,mine?'#e9927a':by?'#e6c47e':'#f1e6ca',f.x,f.z,rake);
 }
 else if(f.kind==='sink'){
  cue('ship-sinking',near(state,f.x,f.z));
  for(let k=0;k<12;k++){const a=k/12*Math.PI*2;emit('#f1f6f2',x+Math.cos(a)*8,SEA+.5,z+Math.sin(a)*8,{size:1.2,life:1.4,vy:6+rand(seed+k)*5,gravity:14,opacity:.9});if(k%2)emit('#4a4743',x,HULL_Y+2+k*.6,z,{size:1.6+k*.15,life:3.2,vx:Math.cos(a),vy:1.6,vz:Math.sin(a),grow:.7,opacity:.45});}
  say(f.by===me?'SUNK! Loot afloat':'Sunk',f.by===me?'#e6c47e':'#f1e6ca',f.x,f.z,true,2.6);
 }
 else if(f.kind==='runout'&&f.target===me){cue('guns-run-out',.9);const e=state.raiders.find((r:any)=>r.id===f.by);say('⚠ Guns run out — turn!','#e9927a',e?.x??f.x,e?.z??f.z,true,1.6);}
 else if(f.kind==='loot'&&f.by===me){cue('coins',.8);say('+'+f.amount+' '+(f.item==='ammo'?'shot':f.item==='cargo'?'spice':f.item),'#a8cea0',f.x,f.z,false,2.2);for(let k=0;k<8;k++)emit('#ffe08a',x,SEA+1,z,{size:.3,life:.9,vx:Math.cos(k)*3,vy:7,vz:Math.sin(k)*3,gravity:14,opacity:1});}
}

/** Floating battle words, drawn through the game's label function. */
export function combatLabels(label:(text:string,x:number,y:number,z:number,color:string)=>void){
 for(const f of floaters)label(f.text,f.x,f.y,f.z,f.color);
}
