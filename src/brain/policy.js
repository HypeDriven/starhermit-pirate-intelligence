export const LOADS=[
 {name:'Low load · default',duty:0.10,slice:2,rest:15},
 {name:'Balanced',duty:0.25,slice:4,rest:8},
 {name:'Faster',duty:0.50,slice:8,rest:3},
 {name:'Paused',duty:0,slice:0,rest:0}
];
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
