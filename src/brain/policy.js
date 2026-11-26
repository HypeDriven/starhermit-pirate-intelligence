export const LOADS=[
 {name:'Low load · default',duty:0.10,slice:2,rest:15},
 {name:'Balanced',duty:0.25,slice:4,rest:8},
 {name:'Faster',duty:0.50,slice:8,rest:3},
 {name:'Paused',duty:0,slice:0,rest:0},
 {name:'High · 75% target',duty:0.75,slice:12,rest:1},
 {name:'Maximum · no idle gap',duty:1,slice:16,rest:0}
];
// The stored index for Paused predates the higher presets.
export const LOAD_ORDER=LOADS.map((_,i)=>i).sort((a,b)=>(LOADS[a].duty||Infinity)-(LOADS[b].duty||Infinity));
export function loadSetting(value){return Number.isInteger(value)&&value>=0&&value<LOADS.length?value:0;}
const clean=(s,n)=>String(s||'').replace(/[<>|]/g,'').slice(0,n);
export function brainRequest(state,crew){
 const ship=state.myShip;
 const nearby=!ship.inHarbour&&state.raiders.concat(state.ships.filter(s=>s.id!==ship.id)).some(s=>s.hull>0&&Math.hypot(s.x-ship.x,s.z-ship.z)<15);
 const emergency=typeof ship.emergency==='boolean'?ship.emergency:ship.hull<ship.maxHull*.45||ship.food<12||(ship.fire||0)>15||(ship.leak||0)>15||nearby;
 const allowed=crew.allowedTasks?.length?crew.allowedTasks.slice():emergency?['helm','lookout','guns','repair','cook','forage','rest']:crew.ordinary.slice();
 const remembered=crew.memories.slice(-2).map(m=>clean(m.text,48)).join('; ');
 const prompt='<|im_start|>system\nChoose a useful pirate crew task. Obey orders. Reply with the task number only.<|im_end|>\n<|im_start|>user\n'
  +clean(crew.role,24)+': '+clean(crew.trait,70)+'\nGoal: '+ship.directive
  +'. Hull '+Math.round(ship.hull/ship.maxHull*100)+'%, food '+Math.round(ship.food)+', timber '+Math.round(ship.timber)
  +', fatigue '+Math.round(crew.fatigue)+'. Sailing '+Boolean(ship.destination)+', enemy '+nearby+'.\n'
  +'Trust '+Math.round(crew.trust??50)+'. Fire '+Math.round(ship.fire||0)+', bilge '+Math.round(ship.leak||0)+', injury '+Math.round(crew.injury||0)+'. Preferred '+(crew.preferred||'auto')+'.\n'
  +'Habits: '+JSON.stringify(crew.contextPreferences?.[ship.directive+':'+(emergency?'danger':'calm')]||crew.preferences)+'. Orders: '+remembered+'\n'
  +allowed.map((t,i)=>i+'='+t).join(', ')+'<|im_end|>\n<|im_start|>assistant\n';
 return {prompt,allowed,emergency};
}
// Fraction of one core averaged over work + deliberate idle time. No accumulated
// credit: returning from a hidden tab can never trigger a catch-up burst.
export function nextWorkAt(end,busy,duty){return duty>0?end+busy*(1/duty-1):Infinity;}
// Workshop sketches: the model only picks one of the authority's candidates.
export function describeDesign(tables,kind,spec){
 const K=tables?.kinds?.[kind],p=tables?.palette;if(!K||!p)return 'sketch';
 const e=K.features?K.features[spec.emblem]:tables.emblems[spec.emblem];
 if(K.features)return p[spec.primary].name.toLowerCase()+' '+K.patterns[spec.pattern]+', '+(spec.emblem?p[spec.secondary].name.toLowerCase()+' '+e:e);
 return p[spec.primary].name.toLowerCase()+' '+K.patterns[spec.pattern]+', '+p[spec.secondary].name.toLowerCase()+(e==='none'?' trim':' '+e);
}
export function designRequest(state,crew,brief){
 const tables=state.workshop,options=brief.candidates.map(c=>describeDesign(tables,brief.kind,c));
 const target=brief.targetId?state.myShip.crew.find(c=>c.id===brief.targetId):null;
 const prompt='<|im_start|>system\nYou are a pirate choosing your favourite design. Reply with the design number only.<|im_end|>\n<|im_start|>user\n'
  +clean(crew.role,24)+': '+clean(crew.trait,70)+'\nDesigning: '+clean(tables?.kinds?.[brief.kind]?.label||brief.kind,24)+(target?' for '+clean(target.name,24):' for the ship')+'.\n'
  +options.map((t,i)=>i+'='+t).join(', ')+'<|im_end|>\n<|im_start|>assistant\n';
 return {prompt,options};
}

export function dialogueRequest(state,crew){
 const ship=state.myShip;
 const condition=ship.fire>15?'the ship is on fire':ship.hull<ship.maxHull*.65?'the hull is damaged':
  ship.food<20?'provisions are low':ship.anchored?'the ship is at anchor':'the ship is under sail';
 return '<|im_start|>system\nWrite a pirate sailor’s dialogue. Speak as the sailor. '
  +'Write one short sentence addressed to the captain.<|im_end|>\n'
  +'<|im_start|>user\nHow would an excitable gunner report that the powder is ready?<|im_end|>\n'
  +'<|im_start|>assistant\nKeep your fingers clear of my fuse!<|im_end|>\n'
  +'<|im_start|>user\n'+clean(crew.role,24)+'. '+clean(crew.trait,80)
  +' Current duty: '+clean(crew.task,12)+'. '+condition+'.<|im_end|>\n<|im_start|>assistant\n';
}

export function banterRequest(crew,opening){
 return '<|im_start|>system\nWrite one short English reply between pirate shipmates. Reply in character with spoken words only.<|im_end|>\n'
  +'<|im_start|>user\nA grumpy carpenter hears, "Could you make me a bigger cannon?"<|im_end|>\n'
  +'<|im_start|>assistant\nOnly if you make me a bigger ship.<|im_end|>\n'
  +'<|im_start|>user\nA '+clean(crew.role,24)+'. '+clean(crew.trait,80)
  +' '+clean(opening.name,24)+' says, "'+clean(opening.text,110)+'"<|im_end|>\n<|im_start|>assistant\n';
}
