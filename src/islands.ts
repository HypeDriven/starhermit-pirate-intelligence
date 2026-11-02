// Islands: a vertex-coloured heightfield with hills and an irregular coast, and
// one set-piece per kind of work ashore (the authority's place.jobs). Ports keep
// their compact footprint so piers reach the anchorage; wild islands are twice
// as wide and full of things to do. Group scale 3 keeps props at sailor scale.
import {scene,Group,Color,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,MeshBasicMaterial} from 'starhermit:scene';
import {METRES} from './navigation.js';
import {box,sphere,cylinder,beam,mesh,barrel,crate,lantern,boatHull,palm,pine,house,batchStatic} from './visuals.js';

const SCALE=3;
type Hill={x:number,z:number,r:number,h:number};
type Spec={wide:number,grass:string,rock:string,sand:string,hills:Hill[],sites:Record<string,[number,number]>};
// Local units (×3 = metres). Sites are where a shore party works on each job.
const SPECS:Record<string,Spec>={
 mossjaw:{wide:1,grass:'#7fa265',rock:'#8d8f7e',sand:'#e0ce98',hills:[{x:-3,z:-3,r:4.6,h:2.4},{x:3.5,z:2.5,r:2.6,h:.7}],sites:{timber:[-5,2.4],treasure:[-1.2,-1.4],forage:[4,-2.8],herbs:[1.4,-5.2]}},
 rattle:{wide:1,grass:'#86996a',rock:'#9a9a8a',sand:'#dccb98',hills:[{x:1.5,z:-2.5,r:5,h:2.6}],sites:{timber:[-5,3.2],treasure:[-.6,.6],ruins:[4.4,2.6]}},
 cinder:{wide:1,grass:'#6f7558',rock:'#5a514c',sand:'#4f4a47',hills:[{x:0,z:-1.2,r:6.2,h:3.6}],sites:{powder:[1.9,-1.2],treasure:[-4.6,3.6],forage:[4.6,3.4]}},
 whisper:{wide:1,grass:'#6f9a6a',rock:'#a4a99b',sand:'#e3d4a4',hills:[{x:-1,z:2,r:4.2,h:1.9}],sites:{timber:[3.6,-3.4],herbs:[-4,-2.6],ruins:[-1,2]}},
};
const PORT:Spec={wide:.5,grass:'#83a36b',rock:'#929d87',sand:'#e0ce98',hills:[],sites:{}};
const PROFILE=[[0,1],[3.4,1.04],[7,.91],[8.5,.6],[9.7,.18],[10.7,-.65]];

function wiggle(a:number,i:number){return 1+Math.sin(a*3+i*2)*.07+Math.cos(a*5-i)*.04;}
/** A local point at profile radius rho on bearing a (follows the wiggly coast). */
function coast(spec:Spec,i:number,a:number,rho:number):[number,number]{const w=wiggle(a,i)*spec.wide;return [Math.cos(a)*rho*w,Math.sin(a)*rho*w*.88];}
// Animated creatures and effects live outside the batched static group.
let live:any=null;
function base(rho:number){for(let k=1;k<PROFILE.length;k++)if(rho<=PROFILE[k][0]){const [r0,h0]=PROFILE[k-1],[r1,h1]=PROFILE[k],t=(rho-r0)/(r1-r0);return h0+(h1-h0)*t*t*(3-2*t);}return PROFILE[PROFILE.length-1][1]-(rho-10.7)*.4;}
function hillAt(spec:Spec,x:number,z:number){let h=0;for(const q of spec.hills){const d=Math.hypot(x-q.x,z-q.z)/q.r;if(d<1)h+=q.h*(1-d*d)*(1-d*d);}return h;}
/** Ground height in local units at a local point. */
function heightAt(spec:Spec,i:number,x:number,z:number){const zz=z/.88,a=Math.atan2(zz,x),rho=Math.hypot(x,zz)/wiggle(a,i)/spec.wide;const inland=Math.max(0,Math.min(1,(8.8-rho)/1.2));return base(rho)+(hillAt(spec,x,z)+Math.sin(x*1.3+i)*Math.sin(z*1.1-i)*.06)*inland;}

function terrain(g:any,spec:Spec,i:number){
 const n=72,radii:number[]=[];for(let k=0;k<=22;k++)radii.push(k<=16?k/16*8.8:8.8+(k-16)/6*2.3);
 const v:number[]=[],c:number[]=[],ind:number[]=[],col=new Color(),grass=new Color(spec.grass),rock=new Color(spec.rock),sand=new Color(spec.sand),wet=new Color(spec.sand).multiplyScalar(.78),deep=new Color('#7f8f7a');
 for(const rho of radii)for(let j=0;j<=n;j++){const a=j/n*Math.PI*2,w=wiggle(a,i)*spec.wide,x=Math.cos(a)*rho*w,z=Math.sin(a)*rho*w*.88,h=heightAt(spec,i,x,z),hill=hillAt(spec,x,z);
  v.push(x,h,z);
  if(rho>9.9)col.copy(wet).lerp(deep,Math.min(1,(rho-9.9)/1.1));else if(rho>8.2)col.copy(sand).lerp(wet,Math.max(0,(rho-9.3)/.6));else{col.copy(grass).lerp(rock,Math.min(1,Math.max(0,(hill-1.1)/1.3)));col.lerp(sand,Math.max(0,(rho-7.6)/.6));const speck=.94+.06*Math.sin(x*3.1+z*2.3);col.multiplyScalar(speck);}
  c.push(col.r,col.g,col.b);}
 const w=n+1;for(let k=0;k<radii.length-1;k++)for(let j=0;j<n;j++){const a=k*w+j;ind.push(a,a+1,a+w,a+1,a+w+1,a+w);}
 const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(v,3));geo.setAttribute('color',new Float32BufferAttribute(c,3));geo.setIndex(ind);geo.computeVertexNormals();
 const m=mesh(g,geo,new MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1}));m.castShadow=false;
}

const animated:{kind:string,obj:any,x:number,z:number,seed:number,spec?:Spec,i?:number}[]=[];
const sites:Record<string,{job:string,x:number,y:number,z:number}[]>={};
const LABELS:Record<string,string>={timber:'Old grove · timber',treasure:'Treasure cave',forage:'Boar country · hunt & gather',herbs:'Waterfall garden · herbs',powder:'Smoking vent · saltpetre',ruins:'Drowned temple · ruins',salvage:'Wreck · salvage'};
export function siteLabel(job:string){return LABELS[job]||job;}

/** Places a prop group on the ground at a local point. */
function at(g:any,spec:Spec,i:number,x:number,z:number,sink=0){const p=new Group();p.position.set(x,heightAt(spec,i,x,z)-sink,z);g.add(p);return p;}
function rock(g:any,spec:Spec,i:number,x:number,z:number,r:number){const p=at(g,spec,i,x,z,r*.3);const m=sphere(p,0,0,0,r,spec.rock);m.scale.set(r*1.2,r*.7,r);m.rotation.y=x*z;return m;}
function bush(g:any,spec:Spec,i:number,x:number,z:number,color:string){const p=at(g,spec,i,x,z);const b=sphere(p,0,.15,0,.38,color);b.scale.y=.55;return p;}

function grove(g:any,spec:Spec,i:number,x:number,z:number,dark=false){
 for(let k=0;k<7;k++){const a=k*2.2+i,r=.9+(k%3)*.8,px=x+Math.sin(a)*r,pz=z+Math.cos(a)*r;const p=at(g,spec,i,px,pz);if(dark||k%2)pine(p,0,0,2.6+(k%3)*.6);else{palm(p,0,0,2.6+(k%2)*.5,k+i);p.position.y-=.84;}}
 // Felled logs, a stump with an axe in it, a stacked pile ready for the boat.
 const s=at(g,spec,i,x+1.1,z-.2);cylinder(s,0,.18,0,.22,.26,.36,'#8a6a45');box(s,.05,.42,0,.05,.32,.05,'#6f5132').rotation.z=.5;box(s,.18,.55,0,.16,.1,.03,'#9aa6a6').rotation.z=.5;
 for(let k=0;k<4;k++){const l=cylinder(s,-.5,.12+(k>2?.2:0),.6+(k%3)*.26,.12,.12,1.2,k%2?'#93704a':'#7d5d3c');l.rotation.z=Math.PI/2;}
}
function cave(g:any,spec:Spec,i:number,x:number,z:number){
 const p=at(g,spec,i,x,z,.2);const mouth=sphere(p,0,.3,0,1,'#16191b');mouth.scale.set(.9,.75,.5);
 for(let k=0;k<6;k++){const a=k/5*Math.PI;const r=sphere(p,Math.cos(a)*1.05,.15+Math.sin(a)*.9,-.1,.38,spec.rock);r.scale.set(.42,.36,.5);}
 const c=at(g,spec,i,x+.9,z+1.3,.08);box(c,0,.14,0,.5,.28,.34,'#7a5434');box(c,0,.3,0,.52,.06,.36,'#b99b57');box(c,0,.2,.18,.08,.1,.02,'#d8bf72');
 for(const r of [.6,-.6]){const xm=box(c,-.9,.02,.2,.9,.04,.12,'#8c3b2c');xm.rotation.y=r;}
}
function foraging(g:any,spec:Spec,i:number,x:number,z:number){
 for(let k=0;k<5;k++){const a=k*1.3+i,px=x+Math.sin(a)*1.6,pz=z+Math.cos(a)*1.3,p=at(g,spec,i,px,pz);cylinder(p,0,.5,0,.07,.1,1,'#80613f');const crown=sphere(p,0,1.15,0,.6,k%2?'#5f8f4f':'#6f9c55');crown.scale.y=.75;for(let f=0;f<4;f++)sphere(p,Math.sin(f*1.7)*.42,1.0+(f%2)*.18,Math.cos(f*1.7)*.42,.09,f%2?'#e48a3c':'#d9493a');}
 // Boar root about the clearing; crabs scuttle on the beach below.
 for(let k=0;k<2;k++){const b=new Group();live.add(b);sphere(b,0,.32,0,.3,'#5f4635').scale.set(.32,.27,.5);sphere(b,0,.36,.42,.18,'#563f30');box(b,0,.32,.6,.12,.09,.08,'#b88c79');for(const s of [-1,1]){box(b,s*.06,.47,.44,.04,.1,.02,'#3d2c22');sphere(b,s*.09,.3,.56,.02,'#efe6d0');}for(const s of [-1,1])for(const f of [-1,1])box(b,s*.14,.1,f*.22,.07,.2,.07,'#3b2b21');b.scale.set(1.3,1.3,1.3);animated.push({kind:'boar',obj:b,x,z,seed:k*3.1+i,spec,i});}
 for(let k=0;k<3;k++){const c=new Group();live.add(c);sphere(c,0,.06,0,.09,'#c84d32').scale.set(.12,.06,.09);for(const s of [-1,1])sphere(c,s*.13,.08,.06,.04,'#d8613f');const [cx,cz]=coast(spec,i,Math.atan2(z/.88,x)+k*.12-.12,9.0+(k%2)*.3);animated.push({kind:'crab',obj:c,x:cx,z:cz,seed:k*2+i,spec,i});}
}
function waterfall(g:any,spec:Spec,i:number,x:number,z:number){
 // Water runs down from the hill to a pool ringed with flowering herbs.
 const top=heightAt(spec,i,x*.55,z*.55),low=heightAt(spec,i,x,z);
 const pool=at(g,spec,i,x,z,.05);const water=new MeshStandardMaterial({color:'#5fb6c4',roughness:.15,metalness:.1,emissive:'#1b5966',emissiveIntensity:.4,transparent:true,opacity:.85});
 const disc=mesh(pool,cylinders(),water,0,.06,0);disc.scale.set(1.2,.05,1);
 const fall=new Group();fall.position.set(x*.78,(top+low)/2,z*.78);g.add(fall);const sheet=box(fall,0,0,0,.6,Math.max(.6,top-low+.4),.08,'#bfe6ea');sheet.material=new MeshStandardMaterial({color:'#cdeef0',emissive:'#5aa9b5',emissiveIntensity:.35,transparent:true,opacity:.75,roughness:.1});fall.lookAt(pool.position.x,fall.position.y,pool.position.z);
 animated.push({kind:'falls',obj:sheet,x,z,seed:i});
 for(let k=0;k<12;k++){const a=k*.53,r=1.5+(k%3)*.3,p=at(g,spec,i,x+Math.cos(a)*r,z+Math.sin(a)*r);cylinder(p,0,.12,0,.015,.02,.24,'#4f7d45');sphere(p,0,.26,0,.07,['#c45a9a','#f0d25a','#8e7ad1','#f2f2e6'][k%4]);}
 for(let k=0;k<4;k++)rock(g,spec,i,x+Math.cos(k*1.6+.4)*1.25,z+Math.sin(k*1.6+.4)*1.05,.3);
}
let disc:any=null;function cylinders(){if(!disc){const g=new Group();disc=cylinder(g,0,0,0,1,1,1,'#ffffff',24).geometry;}return disc;}
function vent(g:any,spec:Spec,i:number,x:number,z:number){
 const p=at(g,spec,i,x,z,.25);const glow=new MeshStandardMaterial({color:'#ff7a2c',emissive:'#ff5a14',emissiveIntensity:2.2,roughness:.6});
 const lava=mesh(p,cylinders(),glow,0,.15,0);lava.scale.set(.9,.08,.75);animated.push({kind:'lava',obj:lava,x,z,seed:i});
 for(let k=0;k<10;k++){const a=k/10*Math.PI*2;const r=sphere(p,Math.cos(a)*1.05,.15,Math.sin(a)*.9,.3,k%3?'#3a3532':'#e9e4d6');r.scale.set(.34,.18,.3);}
 for(let k=0;k<5;k++){const puff=mesh(live,cylinders(),new MeshBasicMaterial({color:'#d9d4cc',transparent:true,opacity:.4,depthWrite:false}),x,p.position.y+.5,z);puff.geometry=sphere(new Group(),0,0,0,1,'#fff').geometry;puff.castShadow=false;animated.push({kind:'smoke',obj:puff,x,z:z,seed:k/5,spec,i});}
 const c=at(g,spec,i,x-1.6,z+.9);barrel(c,0,0,0,.2);box(c,.45,.1,.1,.12,.5,.05,'#7b5a3a').rotation.z=-.4;
}
function temple(g:any,spec:Spec,i:number,x:number,z:number,stones=false){
 const p=at(g,spec,i,x,z,.1),stone='#cbc2a3';
 if(stones){for(let k=0;k<7;k++){const a=k/7*Math.PI*2,s=box(p,Math.cos(a)*1.5,.6,Math.sin(a)*1.5,.32,1.2+(k%3)*.3,.22,'#a9ad9d');s.rotation.y=-a;s.rotation.z=(k%2?.06:-.04);const rune=new MeshStandardMaterial({color:'#9fe6d2',emissive:'#5fd6b6',emissiveIntensity:1.4});const r=mesh(p,cylinders(),rune,Math.cos(a)*1.38,.75,Math.sin(a)*1.38);r.scale.set(.05,.02,.05);r.rotation.x=Math.PI/2;r.rotation.z=a;animated.push({kind:'rune',obj:r,x,z,seed:k});}box(p,0,.12,0,.9,.24,.6,'#8f9384');return;}
 for(let k=0;k<3;k++)box(p,0,.08+k*.16,.9-k*.22,1.8-k*.3,.16,.4,stone);
 for(const sx of [-1,1])for(const sz of [-.7,.3]){const h=sz>0&&sx>0?.8:1.6;cylinder(p,sx*.75,.48+h/2,sz,.13,.15,h,stone);}
 box(p,-.3,2.15,-.2,1.3,.18,1.3,'#bdb394');const head=sphere(p,0,.55,-1.4,.5,'#b9b498');head.scale.set(.42,.52,.42);box(p,0,.55,-1.0,.12,.24,.12,'#a9a385');for(const s of [-1,1])sphere(p,s*.15,.7,-1.03,.06,'#2a2c2a');
 box(p,1.1,.1,.6,.5,.18,.3,stone).rotation.y=.7;
 for(const s of [-1,1]){const t=at(g,spec,i,x+s*1.1,z+1.3);cylinder(t,0,.35,0,.03,.04,.7,'#6f5132');const f=sphere(t,0,.75,0,.08,'#ffb34d');f.material=new MeshStandardMaterial({color:'#ffc06a',emissive:'#ff8a2a',emissiveIntensity:2});animated.push({kind:'flame',obj:f,x,z,seed:s});}
}
function camp(g:any,spec:Spec,i:number,x:number,z:number){
 const p=at(g,spec,i,x,z);for(let k=0;k<7;k++){const a=k/7*Math.PI*2;sphere(p,Math.cos(a)*.3,.05,Math.sin(a)*.3,.08,'#8c8a80');}
 const f=sphere(p,0,.14,0,.13,'#ffb34d');f.material=new MeshStandardMaterial({color:'#ffc06a',emissive:'#ff7a20',emissiveIntensity:2});animated.push({kind:'flame',obj:f,x,z,seed:i});
 // A lean-to shelter of driftwood and palm thatch.
 for(const s of [-1,1])beam(p,[s*.6,0,-.9],[s*.6,1,-.5],.04,'#8a6a45');beam(p,[-.65,1,-.5],[.65,1,-.5],.04,'#8a6a45');const roof=box(p,0,.55,-.75,1.4,.05,1.0,'#9c8d52');roof.rotation.x=-.95;
}

export function buildIslands(places:any[]){
 for(let i=0;i<places.length;i++){
  const p=places[i],g=new Group();g.position.set(p.x*METRES,0,p.z*METRES);g.scale.set(SCALE,SCALE,SCALE);scene.add(g);
  if(p.kind==='wreck'){const wreck=new Group();wreck.rotation.z=.24;wreck.scale.set(.9,.9,.9);boatHull(wreck,true);beam(wreck,[0,1,0],[.4,3.1,0],.09,'#705338');for(let k=0;k<6;k++)box(wreck,Math.sin(k*3)*1.8,-.12,Math.cos(k*4)*2.6,.6,.1,1,'#aa8557');g.add(wreck);batchStatic(g);sites[p.id]=[{job:'salvage',x:p.x*METRES,y:3,z:p.z*METRES}];continue;}
  live=new Group();
  const spec=p.kind==='port'?{...PORT,grass:i===6?'#a4b5a1':PORT.grass}:SPECS[p.id]||PORT;terrain(g,spec,i);
  if(p.kind==='port'){
   for(let k=0;k<6;k++){const a=k*2.39+i;const r=sphere(g,Math.sin(a)*3.8,.65,Math.cos(a)*3.2,.45+(k%2)*.25,'#929d87');r.scale.y=.65;}
   const roofs=i===6?['#6a7c78','#536f70']:i===5?['#8b5a43','#93674b']:['#a7684b','#b87955'];house(g,-1.45,.2,1.65,roofs[0],'#e5d5ae');house(g,1.2,-1.0,1.75,roofs[1],'#d0bd95');house(g,-1.2,-2.2,1.35,roofs[0],'#c8b18c');
   for(let j=0;j<18;j++)box(g,0,.45,3.5+j*.24,1.5,.11,.22,j%3?'#a08255':'#bb9864');for(const side of [-1,1])for(const z of [3.5,5,7.45]){cylinder(g,side*.66,-.05,z,.08,.10,1.7,'#695b43');cylinder(g,side*.66,.64,z,.10,.10,.12,'#ae9364');}for(const x of [-.5,.5])beam(g,[x,.26,3.4],[x,.26,7.7],.08,'#79633e');
   crate(g,.25,.52,5.3,.35);barrel(g,-.3,.5,6.3,.18);lantern(g,.68,1.2,7.2);
   const lx=2.5,lz=-2.2;cylinder(g,lx,2.8,lz,.44,.72,4.0,'#e6dcc0',14);cylinder(g,lx,4.9,lz,.72,.72,.18,'#96754a',14);cylinder(g,lx,5.23,lz,.49,.49,.54,'#405d58',10);cylinder(g,lx,5.65,lz,0,.75,.45,'#866048',10);sphere(g,lx,5.23,lz,.25,'#ffd18c');
   if(i===5){beam(g,[-2.8,1,-.6],[-2.8,4,-.6],.10,'#775c3b');beam(g,[-2.8,4,-.6],[-.5,3.8,-.6],.08,'#775c3b');beam(g,[-.5,3.8,-.6],[-.5,1.7,-.6],.015,'#a89d75');}
   if(i===6){pine(g,-3,1,3);pine(g,-2.5,-2,2.8);}else palm(g,-3,1.6,2.8,i);
   batchStatic(g);continue;
  }
  // Coast: palms lean out over the beach, rocks break up the waterline, bushes fill the slopes.
  for(let k=0;k<16;k++){const [x,z]=coast(spec,i,k/16*Math.PI*2+i,7.5+(k%3)*.35);if(p.id==='cinder'&&k%3)continue;const q=at(g,spec,i,x,z);palm(q,0,0,2.4+(k%3)*.45,k*1.7+i);q.position.y-=.84;}
  for(let k=0;k<14;k++){const [x,z]=coast(spec,i,k*2.39+i,9.7+(k%3)*.45);rock(g,spec,i,x,z,.35+(k%3)*.2);}
  for(let k=0;k<22;k++){const x=Math.sin(k*5.1+i)*(2+k%7)*1.05,z=Math.cos(k*3.7+i)*(2+k%6)*1.05;bush(g,spec,i,x,z,p.id==='cinder'?'#6d6f4f':k%2?'#668853':'#a1b46a');}
  for(const q of spec.hills)for(let k=0;k<4;k++){const a=k*1.9+i;rock(g,spec,i,q.x+Math.cos(a)*q.r*.35,q.z+Math.sin(a)*q.r*.35,.35+(k%2)*.25);}
  const S=spec.sites;
  if(S.timber)grove(g,spec,i,S.timber[0],S.timber[1],p.id==='whisper');
  if(S.treasure){if(p.id==='rattle'){const t=at(g,spec,i,S.treasure[0],S.treasure[1]);const skull=sphere(t,0,.55,0,.85,'#d7d0af');skull.scale.z=.65;for(const x of [-.3,.3])sphere(t,x,.7,.56,.17,'#465b52');box(t,0,.2,.6,.6,.25,.12,'#d5c9a7');}else cave(g,spec,i,S.treasure[0],S.treasure[1]);}
  if(S.forage)foraging(g,spec,i,S.forage[0],S.forage[1]);
  if(S.herbs)waterfall(g,spec,i,S.herbs[0],S.herbs[1]);
  if(S.powder)vent(g,spec,i,S.powder[0],S.powder[1]);
  if(S.ruins)temple(g,spec,i,S.ruins[0],S.ruins[1],p.id==='whisper');
  camp(g,spec,i,(spec.hills[0]?.x||0)*-.6+2,(spec.hills[0]?.z||0)*-.6+3.4);
  sites[p.id]=Object.keys(S).map(job=>({job,x:p.x*METRES+S[job][0]*SCALE,y:(heightAt(spec,i,S[job][0],S[job][1])+.1)*SCALE,z:p.z*METRES+S[job][1]*SCALE}));
  batchStatic(g);g.add(live);
 }
}
/** Where a shore party works for a job at a place, in world metres. */
export function jobSite(placeId:string,job:string){return (sites[placeId]||[]).find(s=>s.job===job)||null;}
export function jobSites(placeId:string){return sites[placeId]||[];}

export function animateIslands(time:number){
 for(const a of animated){const o=a.obj;
  if(a.kind==='boar'&&a.spec){const t=time*.25+a.seed,x=a.x+Math.sin(t)*1.6+Math.sin(t*2.3)*.4,z=a.z+Math.cos(t*.8)*1.3,dx=Math.cos(t)*1.6+Math.cos(t*2.3)*.92,dz=-Math.sin(t*.8)*1.04;o.position.set(x,heightAt(a.spec,a.i!,x,z),z);o.rotation.y=Math.atan2(dx,dz);o.rotation.x=Math.sin(time*9+a.seed)*.04;}
  else if(a.kind==='crab'&&a.spec){const t=time*.6+a.seed,x=a.x+Math.sin(t)*.6,z=a.z+Math.cos(t*1.3)*.3;o.position.set(x,heightAt(a.spec,a.i!,x,z),z);o.rotation.y=Math.sin(t*3)*.4;}
  else if(a.kind==='smoke'&&a.spec){const c=(time*.18+a.seed)%1;o.position.set(a.x+Math.sin(c*4+a.seed*9)*.3,heightAt(a.spec,a.i!,a.x,a.z)+.3+c*3.2,a.z+c*.6);const s=.25+c*.9;o.scale.set(s,s,s);o.material.opacity=.45*(1-c);}
  else if(a.kind==='lava')o.material.emissiveIntensity=1.8+Math.sin(time*2.1)*.5+Math.sin(time*5.3)*.2;
  else if(a.kind==='flame'){const k=1+Math.sin(time*13+a.seed)*.18+Math.sin(time*7.1)*.1;o.scale.set(.13*k,.2*k,.13*k);}
  else if(a.kind==='falls')o.material.emissiveIntensity=.3+Math.sin(time*6)*.08;
  else if(a.kind==='rune')o.material.emissiveIntensity=1+Math.sin(time*1.4+a.seed)*.7;
 }
}
