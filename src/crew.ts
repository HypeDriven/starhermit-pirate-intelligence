// Crew on deck: where each sailor stands for their duty, how they get there and
// what their arms and legs do. Purely presentation; tasks come from the authority.
//
// Doll limbs are [left leg, left arm, right leg, right arm]. Positive rotation.x
// swings a limb backwards. A walk swings the legs in opposition and each arm
// against the leg on its own side.

const DECK=1.34,GUN_DECK=.28,HOLD=-.72;
const FORE={z:1.15,top:6.8},WHEEL={x:0,z:-2.2},GARLAND={x:-.3,z:.3};
const GUNS=[-1.35,.02,1.39];
const WALK=.75,CLIMB=1.4;

type Pose='stand'|'walk'|'helm'|'scope'|'climb'|'carry'|'place'|'hammer'|'fish'|'stir'|'rest'|'ram';
type Plan={x:number,y:number,z:number,face:number,pose:Pose,prop?:'scope'|'shot'|'rod'|'tool'|''};

function cycle(t:number,period:number){return ((t%period)+period)%period;}
function faceTo(dx:number,dz:number){return Math.atan2(dx,dz);}

/** Where a sailor wants to be right now, from task, time and their slot. */
function plan(task:string,t:number,i:number,slot:number,deck:number,s:any):Plan{
 const seed=i*7.3+slot*3.1;
 if(deck===1){ // gun deck cutaway
  if(task==='guns'){const c=cycle(t+seed,9),gun=Math.floor((t+seed)/9)%3,side=slot%2?-1:1;
   if(c<3.5)return {x:0,y:GUN_DECK,z:-2.45,face:Math.PI,pose:'stand',prop:''};
   if(c<7)return {x:side*.85,y:GUN_DECK,z:-1.5+gun*1.5,face:faceTo(side,0),pose:'carry',prop:'shot'};
   return {x:side*.85,y:GUN_DECK,z:-1.5+gun*1.5,face:faceTo(side,0),pose:'place',prop:''};}
  return {x:-1.1,y:GUN_DECK,z:-.8+slot*.6,face:-Math.PI/2,pose:'hammer',prop:'tool'};
 }
 if(deck===2){ // cargo hold cutaway
  if(task==='rest')return {x:.3,y:HOLD+.12,z:-2.4+slot*.7,face:0,pose:'rest'};
  if(task==='cook')return {x:-.2,y:HOLD,z:-1.2+slot*.5,face:Math.PI/2,pose:'stir',prop:'tool'};
  const c=cycle(t+seed,10);return c<5?{x:-.6,y:HOLD,z:-2.2+slot*.4,face:-Math.PI/2,pose:'carry',prop:''}:{x:.6,y:HOLD,z:-.6+slot*.4,face:Math.PI/2,pose:'place',prop:''};
 }
 switch(task){
  case 'helm':return slot?{x:.45,y:DECK,z:-2.5,face:0,pose:'stand'}:{x:WHEEL.x,y:DECK,z:WHEEL.z,face:0,pose:'helm'};
  case 'lookout':{
   if(slot)return {x:(slot%2?.6:-.6),y:DECK,z:3.3,face:faceTo(slot%2?.4:-.4,1),pose:'scope',prop:'scope'};
   // Up the shrouds to the crow's nest, a long watch aloft, down again for a sweep from the bow.
   const c=cycle(t+seed,64);
   if(c<4)return {x:.55,y:DECK,z:FORE.z+.6,face:faceTo(0,1),pose:'scope',prop:'scope'};
   if(c<6)return {x:1.3,y:DECK,z:FORE.z+.1,face:faceTo(-1,0),pose:'stand',prop:''};
   if(c<10)return {x:.15,y:FORE.top-.3,z:FORE.z+.1,face:faceTo(-1,0),pose:'climb',prop:''};
   if(c<52)return {x:.1,y:FORE.top-.3,z:FORE.z+.08,face:Math.sin(t*.25+i)*1.4,pose:'scope',prop:'scope'};
   if(c<56)return {x:1.3,y:DECK,z:FORE.z+.1,face:faceTo(-1,0),pose:'climb',prop:''};
   return {x:.5,y:DECK,z:3.5,face:Math.sin(t*.3)*.8,pose:'scope',prop:'scope'};
  }
  case 'guns':{
   // Fetch a ball from the garland, carry it to a gun's rack, stow it, repeat.
   const period=8,c=cycle(t+seed,period),side=(Math.floor((t+seed)/period)+slot)%2?-1:1,gun=GUNS[(Math.floor((t+seed)/(period*2))+slot)%3];
   if(c<1.2)return {x:GARLAND.x+.12,y:DECK,z:GARLAND.z-.18,face:faceTo(-1,1),pose:'place',prop:''};
   if(c<5.5)return {x:side*.9,y:DECK,z:gun,face:faceTo(side,0),pose:'carry',prop:'shot'};
   if(c<6.6)return {x:side*.9,y:DECK,z:gun,face:faceTo(side,0),pose:'place',prop:'shot'};
   return {x:side*.9,y:DECK,z:gun,face:faceTo(side,0),pose:'ram',prop:''};
  }
  case 'repair':return {x:.95-slot*.3,y:DECK-.08,z:-.7+slot*.5,face:faceTo(1,0),pose:'hammer',prop:'tool'};
  case 'cook':return {x:-.7,y:DECK,z:-1.6+slot*.4,face:faceTo(1,0),pose:'stir',prop:'tool'};
  case 'forage':{const side=slot%2?-1:1;return {x:side*1.12,y:DECK,z:1.9-Math.floor(slot/2)*.5,face:faceTo(side,0),pose:'fish',prop:'rod'};}
  case 'rest':return {x:-.65+slot*.15,y:DECK+.1,z:-2.6+slot*.55,face:0,pose:'rest'};
 }
 return {x:0,y:DECK,z:0,face:0,pose:'stand'};
}

/** Arms and legs for a pose; phase drives walking and working rhythms. */
function limbs(d:any,pose:Pose,phase:number,t:number){
 const [legL,armL,legR,armR]=d.userData.limbs,sw=Math.sin(phase);
 for(const l of [legL,armL,legR,armR]){l.rotation.set(0,0,0);}
 d.rotation.x=0;d.rotation.z=0;
 switch(pose){
  case 'walk':legL.rotation.x=sw*.55;legR.rotation.x=-sw*.55;armL.rotation.x=-sw*.45;armR.rotation.x=sw*.45;break;
  case 'carry':legL.rotation.x=sw*.45;legR.rotation.x=-sw*.45;armL.rotation.x=-1.05;armR.rotation.x=-1.05;armL.rotation.z=-.25;armR.rotation.z=.25;break;
  case 'climb':{const c=Math.sin(phase*.8);armL.rotation.x=-2.7+c*.35;armR.rotation.x=-2.7-c*.35;legL.rotation.x=-.5-c*.4;legR.rotation.x=-.5+c*.4;break;}
  case 'helm':armL.rotation.x=-1.2+Math.sin(t*.7)*.12;armR.rotation.x=-1.2-Math.sin(t*.7)*.12;armL.rotation.z=-.2;armR.rotation.z=.2;break;
  case 'scope':armR.rotation.x=-2.25;armR.rotation.z=.55;armL.rotation.x=-1.85;armL.rotation.z=-.15;break;
  case 'place':{const k=.5+.5*Math.sin(t*3);armL.rotation.x=-.7-k*.5;armR.rotation.x=-.7-k*.5;legL.rotation.x=-.35*k;legR.rotation.x=-.35*k;d.rotation.x=.25*k;break;}
  case 'ram':{const k=Math.sin(t*2.6);armL.rotation.x=-1.3+k*.35;armR.rotation.x=-1.3+k*.35;legL.rotation.x=-.25;legR.rotation.x=.3;d.rotation.x=.12+k*.06;break;}
  case 'hammer':{legL.rotation.x=-1.4;legR.rotation.x=.2;d.rotation.x=.18;armR.rotation.x=-1.6+Math.max(0,Math.sin(t*6))*1.1;armL.rotation.x=-.6;break;}
  case 'fish':armL.rotation.x=-.9;armR.rotation.x=-.9+Math.sin(t*.9)*.08;break;
  case 'stir':armR.rotation.x=-1.0+Math.sin(t*3)*.25;armR.rotation.z=Math.cos(t*3)*.25;armL.rotation.x=-.4;break;
  case 'rest':d.rotation.z=Math.PI/2;legL.rotation.x=-.1;legR.rotation.x=.1;armL.rotation.x=-.2;armR.rotation.x=-2.8;break;
  default:armL.rotation.x=Math.sin(t*.9)*.04;armR.rotation.x=-Math.sin(t*.9)*.04;
 }
}

const states=new WeakMap<any,any>();
/** Moves and poses one ship's dolls for its crew. */
export function animateCrew(obj:any,s:any,t:number,dt:number,cut:boolean,deck:number){
 for(let i=0;i<obj.dolls.length;i++){
  const d=obj.dolls[i],c=s?.crew?.[i];if(!c||!d.visible)continue;
  const slot=s.crew.slice(0,i).filter((o:any)=>!o.away&&o.task===c.task).length,goal=plan(c.task,t,i,slot,cut?deck:0,s);
  let st=states.get(d);if(!st||st.deck!==(cut?deck:0)){st={x:goal.x,y:goal.y,z:goal.z,face:goal.face,phase:0,deck:cut?deck:0};states.set(d,st);}
  // Walk on the deck, climb in the rigging; vertical moves are climbs.
  const dx=goal.x-st.x,dy=goal.y-st.y,dz=goal.z-st.z,flat=Math.hypot(dx,dz),climbing=Math.abs(dy)>.3;
  let pose:Pose=goal.pose,moving=false;
  if(climbing){const step=Math.min(1,CLIMB*dt/Math.max(.001,Math.hypot(dy,flat)));st.x+=dx*step;st.y+=dy*step;st.z+=dz*step;pose='climb';moving=true;st.face=faceTo(-st.x,FORE.z-st.z);}
  else if(flat>.03){const step=Math.min(flat,WALK*dt);st.x+=dx/flat*step;st.z+=dz/flat*step;st.y+=dy*Math.min(1,dt*6);moving=true;pose=goal.pose==='carry'?'carry':'walk';const want=faceTo(dx,dz);st.face+=Math.atan2(Math.sin(want-st.face),Math.cos(want-st.face))*Math.min(1,dt*10);}
  else{st.y+=dy*Math.min(1,dt*6);st.face+=Math.atan2(Math.sin(goal.face-st.face),Math.cos(goal.face-st.face))*Math.min(1,dt*4);}
  st.phase+=dt*(moving?(climbing?7:8.5):0);
  d.position.set(st.x,st.y,st.z);d.rotation.y=st.face;limbs(d,pose,st.phase,t+i);
  const prop=climbing?'':goal.prop||'';
  d.userData.scope.visible=prop==='scope';d.userData.shot.visible=prop==='shot';d.userData.rod.visible=prop==='rod';d.userData.tool.visible=prop==='tool';
  if(prop==='tool')d.userData.tool.rotation.x=pose==='hammer'?-.9+Math.max(0,Math.sin((t+i)*6))*1.1:0;
 }
 // The ready racks show the authority's stocked volleys on each side.
 if(obj.racks)for(const side of ['port','starboard'])obj.racks[side].forEach((b:any,k:number)=>{b.visible=!cut&&!!s&&(s.racks?.[side]||0)>k;});
}
