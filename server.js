/* Pirate Intelligence. This file is run unchanged by StarHermit's Jint authority
   and the engine's local practice worker. All mutations are validated here. */
var TASKS = ['helm','lookout','guns','repair','cook','forage','rest'];
var PLACES = [
 {id:'saltwick',name:'Saltwick',kind:'port',x:-22,z:8,tag:'A respectable den of thieves',buy:8,sell:15},
 {id:'mossjaw',name:'Mossjaw Cay',kind:'island',x:12,z:17,tag:'Timber, treasure & terrible mosquitoes'},
 {id:'gallows',name:'Gallows Reach',kind:'port',x:25,z:-19,tag:'Rum dear. Manners optional.',buy:13,sell:23},
 {id:'rattle',name:'Rattlebone Isle',kind:'island',x:-22,z:-23,tag:'Something shiny under something dead'},
 {id:'wreck',name:'The Crooked Wreck',kind:'wreck',x:32,z:23,tag:'Salvage for the morally flexible'}
];
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function distance(a,b){var x=a.x-b.x,z=a.z-b.z;return Math.sqrt(x*x+z*z);}
function place(id){for(var i=0;i<PLACES.length;i++)if(PLACES[i].id===id)return PLACES[i];return null;}
function crew(){return [
 {id:'morrow',name:'Mara Morrow',role:'Captain',rank:0,color:'#b25952',trait:'A soft heart. A very sharp cutlass.',ordinary:['helm','lookout','rest'],task:'helm'},
 {id:'brisk',name:'Barnaby Brisk',role:'First mate',rank:1,color:'#dda854',trait:'Runs a tight ship. Keeps a loose tooth.',ordinary:['helm','lookout','repair','rest'],task:'lookout'},
 {id:'fuse',name:'Little Fuse',role:'Gunner',rank:2,color:'#7d88a2',trait:'Small, cheerful, technically on fire.',ordinary:['guns','lookout','rest'],task:'guns'},
 {id:'peg',name:'Peg Coppernail',role:'Carpenter',rank:2,color:'#77a891',trait:'Will fix anything except your attitude.',ordinary:['repair','forage','rest'],task:'repair'},
 {id:'tallow',name:'Auntie Tallow',role:'Cook',rank:2,color:'#c57c9b',trait:'Her soup has a body count.',ordinary:['cook','forage','rest'],task:'cook'},
 {id:'pip',name:'Pip Gulliver',role:'Navigator',rank:2,color:'#8aadaf',trait:'Afraid of the sea. Excellent at maps.',ordinary:['helm','lookout','forage','rest'],task:'lookout'}
 ].map(function(c){c.level=1;c.xp=0;c.fatigue=8;c.preferences={};c.memories=[];c.manualUntil=0;c.away=false;c.brain='instinct';return c;});}
function newShip(id,name,index){return {id:id,name:index===0?'The Mild Inconvenience':String(name||'Captain').slice(0,24)+"’s Bad Idea",ownerName:name,x:-8+index*4,z:1+index*5,heading:0,hull:100,maxHull:100,morale:87,food:75,timber:30,ammo:32,gold:340,cargo:5,level:1,xp:0,crew:crew(),directive:'prosper',destination:null,anchored:true,away:null,mission:null,completed:[],missionsDone:[],kills:0,lastShot:-999,lastBrain:{},delegate:'',log:[{at:0,name:'Mara',text:'A ship, six questionable souls, and absolutely no refunds.',kind:'crew'}]};}
function log(s,t,name,text,kind){s.log.push({at:Math.round(t),name:name,text:String(text).slice(0,180),kind:kind||'crew'});if(s.log.length>35)s.log.shift();}
function xp(s,n){s.xp+=n;while(s.xp>=s.level*100){s.xp-=s.level*100;s.level++;s.maxHull+=10;s.hull=Math.min(s.maxHull,s.hull+15);log(s,0,'Shipwright','Ship level '+s.level+'! More hull. More swagger.','reward');}}
function cxp(c,n){c.xp+=n;while(c.xp>=c.level*35){c.xp-=c.level*35;c.level++;}}
function emergency(w,s){var enemy=false;for(var i=0;i<w.raiders.length;i++)if(w.raiders[i].hull>0&&distance(s,w.raiders[i])<15)enemy=true;return s.hull<s.maxHull*.45||s.food<12||enemy;}
function canTask(w,s,c,task,issuer,override){if(TASKS.indexOf(task)<0||c.away)return false;if(c.ordinary.indexOf(task)>=0)return true;return (issuer==='morrow'||issuer==='brisk')&&!!override&&emergency(w,s);}
function speak(task){return {helm:'Aye! Pointy end toward the profit.',lookout:'Eyes up, you magnificent scoundrels!',guns:'Permission to make a bloody great noise?',repair:'This hole was not in the original design.',cook:'Soup’s on! Best not ask what’s in it.',forage:'Back with wood. Or a new curse.',rest:'Wake me for treasure. Or a decent mutiny.'}[task];}
function choose(w,s,c){
 var best='rest',score=-999;
 for(var i=0;i<c.ordinary.length;i++){
  var t=c.ordinary[i],v=t==='rest'?(c.fatigue>70?8:0):1;
  if(t==='helm'&&s.destination)v+=5;
  if(t==='lookout')v+=s.directive==='explore'?5:1;
  if(t==='guns')v+=s.directive==='hunt'?6:0;
  if(t==='repair')v+=s.hull<s.maxHull-2?(s.directive==='survive'?9:6):0;
  if(t==='cook')v+=s.food<60?5:0;
  if(t==='forage')v+=s.anchored&&s.directive==='prosper'?3:0;
  v+=(c.preferences[t]||0);if(v>score){score=v;best=t;}
 }
 // Officers can reassign reluctant specialists, but only in a real emergency.
 if(emergency(w,s)&&s.hull<s.maxHull*.4&&c.id!=='morrow'&&s.timber>0)best='repair';
 return best;
}
function view(w,id){var own=w.ships[id];return {type:'state',schema:1,time:w.time,day:Math.floor(w.time/240)+1,weather:w.weather,places:PLACES,ships:Object.keys(w.ships).map(function(k){var s=w.ships[k];return {id:s.id,name:s.name,ownerName:s.ownerName,x:s.x,z:s.z,hull:s.hull,maxHull:s.maxHull,heading:s.heading,level:s.level,anchored:s.anchored};}),raiders:w.raiders,myShip:own||null};}
function result(ctx,w){var b=[];for(var i=0;i<ctx.players.length;i++)b.push({to:[ctx.players[i].id],data:view(w,ctx.players[i].id)});var keys=Object.keys(w.ships);for(var j=0;j<keys.length;j++){var s=w.ships[keys[j]];if(s.delegate&&ctx.players.some(function(p){return p.id===s.delegate;}))b.push({to:[s.delegate],data:{type:'brain_context',ownerId:s.id,time:w.time,ship:s,emergency:emergency(w,s),nearbyEnemies:w.raiders.filter(function(r){return r.hull>0&&distance(s,r)<17;}).map(function(r){return {name:r.name,hull:r.hull};})}});}return {ok:true,sessionState:w,broadcast:b};}
function near(s,kind){var best=null,d=999;for(var i=0;i<PLACES.length;i++){var p=PLACES[i],n=distance(s,p);if((!kind||p.kind===kind)&&n<d){d=n;best=p;}}return d<7?best:null;}
function mission(w,s){var m=s.mission;if(!m)return;var done=(m.id==='timber'&&s.timber>=50)||(m.id==='hunter'&&s.kills>m.start)||(m.id==='courier'&&s.anchored&&near(s,'port')&&near(s,'port').id==='gallows'&&s.cargo>=5)||(m.id==='treasure'&&s.completed.indexOf('treasure')>=0);if(done){if(m.id==='courier')s.cargo-=5;s.gold+=m.reward;xp(s,70);if(!s.missionsDone)s.missionsDone=[];s.missionsDone.push(m.id);log(s,w.time,'Contract',m.title+' complete! +'+m.reward+' gold.','reward');s.mission=null;}}
function fire(w,s,target){
 var e=null;for(var i=0;i<w.raiders.length;i++)if(w.raiders[i].id===target)e=w.raiders[i];
 if(!e)e=w.ships[target];if(!e||e.id===s.id||e.hull<=0)return 'No target afloat.';
 if(distance(s,e)>17)return 'Out of range. Close to 17 fathoms.';if(w.time-s.lastShot<7)return 'Cannons reloading.';if(s.ammo<2)return 'Out of shot. Resupply in port.';
 var g=s.crew.filter(function(c){return !c.away&&c.task==='guns';}).length;
 if(!g)return 'Put someone on the guns first.';
 s.lastShot=w.time;s.ammo-=2;e.hull=Math.max(0,e.hull-14-g*5-s.level*2);log(s,w.time,'Little Fuse','BOOM! '+e.name+' has fewer opinions now.','combat');
 if(e.hull<=0){s.kills++;s.gold+=120;xp(s,65);log(s,w.time,'Mara','Send a boat for the spoils. +120 gold.','reward');if(e.npc)e.respawn=w.time+100;else{e.hull=e.maxHull*.6;e.x=-24;e.z=8;e.gold=Math.floor(e.gold*.75);e.destination=null;e.anchored=true;log(e,w.time,'Harbourmaster','Towed home. Lost a quarter of the purse.','combat');}}
 return null;
}
function tick(w,dt,random){
 w.time+=dt;w.weather=Math.floor(w.time/180)%3===2?'Squall on the horizon':'Fair winds';
 var keys=Object.keys(w.ships);
 for(var k=0;k<keys.length;k++){
  var s=w.ships[keys[k]];
  if(s.destination&&!s.anchored){var p=place(s.destination);if(!p){var targetId=s.destination.slice(5);p=w.ships[targetId]||w.raiders.filter(function(e){return e.id===targetId&&e.hull>0;})[0];}if(!p){s.destination=null;s.anchored=true;continue;}var d=distance(s,p),helm=s.crew.some(function(c){return c.task==='helm'&&!c.away;});if(!helm){s.crew[0].task='helm';helm=true;}var speed=(s.directive==='explore'?2.1:1.7)*(1+s.level*.03),step=Math.min(Math.max(0,d-6.5),dt*speed);s.heading=Math.atan2(p.x-s.x,p.z-s.z);if(d>6.5){s.x+=(p.x-s.x)/d*step;s.z+=(p.z-s.z)/d*step;}if(d<=6.65){s.anchored=true;s.destination=null;log(s,w.time,'Pip','Anchor down at '+p.name+'. Mostly on purpose.','travel');xp(s,15);}}
  s.food=Math.max(0,s.food-dt*.025);s.morale=clamp(s.morale+(s.food>0?.008:-.1)*dt,0,100);
  for(var j=0;j<s.crew.length;j++){var c=s.crew[j];if(c.away)continue;c.fatigue=clamp(c.fatigue+(c.task==='rest'?-.4:.028)*dt,0,100);if(c.task==='repair'&&s.timber>=.04*dt&&s.hull<s.maxHull){s.hull=Math.min(s.maxHull,s.hull+dt*.3*(1+c.level*.1));s.timber-=dt*.04;}if(c.task==='cook'&&s.food<85)s.food=Math.min(85,s.food+dt*.035);cxp(c,dt*.07);
   if(Math.floor(w.time/8)!==Math.floor((w.time-dt)/8)&&w.time>c.manualUntil&&w.time-(s.lastBrain[c.id]===undefined?-999:s.lastBrain[c.id])>18){c.brain='instinct';var t=choose(w,s,c);if(t!==c.task){c.task=t;log(s,w.time,c.name.split(' ')[0],speak(t));}}
  }
  if(s.away&&w.time>=s.away.returnAt){var a=s.away;s.away=null;for(var q=0;q<s.crew.length;q++)if(s.crew[q].away){s.crew[q].away=false;cxp(s.crew[q],18);}if(a.job==='timber'){s.timber+=25;log(s,w.time,'Peg','25 timber! The trees put up a decent fight.','reward');}else if(a.job==='treasure'){var found=random>.18;s.gold+=found?150:35;s.completed.push('treasure');log(s,w.time,'Brisk',found?'A chest! 150 gold and one deeply offended crab.':'Only 35 gold. The skeleton got here first.','reward');}else{s.ammo+=12;s.timber+=10;log(s,w.time,'Pip','Salvaged 12 shot and 10 timber. Slightly haunted.','reward');}xp(s,35);}
  if(s.directive==='hunt'&&Math.floor(w.time/9)!==Math.floor((w.time-dt)/9)){for(var r=0;r<w.raiders.length;r++)if(w.raiders[r].hull>0&&distance(s,w.raiders[r])<17){fire(w,s,w.raiders[r].id);break;}}
  if(w.weather!=='Fair winds'&&!s.anchored)s.hull=Math.max(1,s.hull-.06*dt);
  mission(w,s);
 }
 for(var r=0;r<w.raiders.length;r++){var e=w.raiders[r];if(e.hull<=0){if(w.time>=e.respawn){e.hull=e.maxHull;e.x=e.homeX;e.z=e.homeZ;}continue;}e.x+=Math.sin(w.time*.02+r)*dt*.12;e.z+=Math.cos(w.time*.025+r)*dt*.12;for(var k=0;k<keys.length;k++){var s=w.ships[keys[k]];if(distance(s,e)<14&&w.time-e.lastShot>12){s.hull=Math.max(0,s.hull-5);e.lastShot=w.time;log(s,w.time,'Little Fuse','Incoming! They’ve scratched the bloody paint!','combat');if(s.hull<=0){s.gold=Math.floor(s.gold*.75);s.hull=s.maxHull*.65;s.x=-24;s.z=8;s.anchored=true;s.destination=null;log(s,w.time,'Harbourmaster','Fished you out. Lost 25% gold. Try floating next time.','combat');}}}}
}
globalThis.game={
 persistent:true,tickRateHz:1,replays:true,queues:[{key:'free-sea',teams:1,teamSize:8}],
 createSession:function(ctx){
  var w=ctx.sessionState;
  if(!w||w.schema!==1){w={schema:1,time:0,lastTick:ctx.now-(ctx.pausedMs||0),weather:'Fair winds',ships:{},raiders:[{id:'redwake',name:'The Red Wake',npc:true,x:8,z:-6,homeX:8,homeZ:-6,hull:90,maxHull:90,heading:2,lastShot:0,respawn:0},{id:'taxman',name:'The Tax Collector',npc:true,x:24,z:6,homeX:24,homeZ:6,hull:130,maxHull:130,heading:1,lastShot:0,respawn:0}]};}
  w.lastTick=ctx.now-(ctx.pausedMs||0);for(var i=0;i<ctx.players.length;i++)if(!w.ships[ctx.players[i].id])w.ships[ctx.players[i].id]=newShip(ctx.players[i].id,ctx.players[i].displayName||ctx.players[i].name,i);return result(ctx,w);
 },
 onMembershipChange:function(ctx){var w=ctx.sessionState;if(ctx.membership.change==='joined'&&!w.ships[ctx.membership.userId]){if(Object.keys(w.ships).length>=16)return {ok:false,error:'This sea has room for 16 captains.'};w.ships[ctx.membership.userId]=newShip(ctx.membership.userId,ctx.membership.name,Object.keys(w.ships).length);}return result(ctx,w);},
 onPlayerMessage:function(ctx){
  var w=ctx.sessionState,m=ctx.message.data,id=ctx.message.from,s=w.ships[id];
  if(!m||typeof m!=='object'||typeof m.type!=='string')return {ok:false,error:'Invalid command.'};
  if(m.type==='snapshot'&&ctx.sessionId==='brine-local')return {ok:true,broadcast:[{to:[id],data:{type:'snapshot',world:w}}]};
  if(m.type==='sync')return result(ctx,w);
  if(m.type==='decision'&&m.ownerId!==id){s=w.ships[m.ownerId];if(!s||s.delegate!==id)return {ok:false,error:'This captain has not delegated crew decisions to you.'};}
  if(!s)return {ok:false,error:'No ship assigned to this participant.'};
  var error=null;
  if(m.type==='sail'){var p=place(m.destination);if(!p)error='Unknown destination.';else if(s.away)error='Wait for the away party to return.';else{s.destination=p.id;s.anchored=false;s.crew[0].task='helm';log(s,w.time,'Mara','Set course for '+p.name+'. Try not to hit it.','travel');}}
  else if(m.type==='pursue'){var target=w.ships[m.target]||w.raiders.filter(function(e){return e.id===m.target&&e.hull>0;})[0];if(!target||target.id===s.id||!Number.isFinite(target.x))error='No target afloat.';else if(s.away)error='Wait for the away party.';else{s.destination='ship:'+target.id;s.anchored=false;s.crew[0].task='helm';log(s,w.time,'Mara','Close with '+target.name+'. Looking charming is optional.','combat');}}
  else if(m.type==='anchor'){s.anchored=!s.anchored;if(!s.anchored&&!s.destination)s.anchored=true;log(s,w.time,'Brisk',s.anchored?'Anchor down. Mind your toes.':'Heave away!');}
  else if(m.type==='directive'){if(['prosper','hunt','explore','survive'].indexOf(m.value)<0)error='Unknown directive.';else{s.directive=m.value;log(s,w.time,'Captain’s orders','Standing directive: '+m.value+'.');for(var i=0;i<s.crew.length;i++)if(!s.crew[i].away)s.crew[i].task=choose(w,s,s.crew[i]);}}
  else if(m.type==='order'||m.type==='decision'){
   var c=s.crew.filter(function(c){return c.id===m.crewId;})[0];
   if(!c)error='Unknown crew member.';
   else if(m.type==='decision'&&w.time<(s.lastBrain[c.id]===undefined?-999:s.lastBrain[c.id])+5)error='Decision already made for this watch.';
   else if(m.type==='decision'&&w.time<c.manualUntil)error='A direct order is still in effect.';
   else if(!canTask(w,s,c,m.task,m.issuer,!!m.override))error='Outside '+c.role.toLowerCase()+" duties. An officer may override only during danger (low hull, low food, or nearby enemy).";
   else{c.task=m.task;if(m.type==='order'){c.manualUntil=w.time+35;c.preferences[m.task]=clamp((c.preferences[m.task]||0)+.7,0,6);c.memories.push({task:m.task,directive:s.directive,emergency:emergency(w,s),text:String(m.note||'Direct order: '+m.task).slice(0,120)});if(c.memories.length>10)c.memories.shift();log(s,w.time,c.name.split(' ')[0],(m.override?'By the first mate’s warrant! ':'')+speak(m.task));}else{s.lastBrain[c.id]=w.time;c.brain=m.source==='browser'&&id===s.id?'browser LLM':'local LLM';log(s,w.time,c.name.split(' ')[0],speak(m.task));}}
  }
  else if(m.type==='delegate'){if(typeof m.userId!=='string'||m.userId.length>80)error='Invalid brain delegate ID.';else{s.delegate=m.userId;log(s,w.time,'Brisk',m.userId?'Local brain officer authorised for crew decisions.':'Local brain officer disconnected.');}}
  else if(m.type==='fire')error=fire(w,s,m.target);
  else if(m.type==='away'){
   var p=near(s);if(!s.anchored||!p||p.kind==='port')error='Anchor within 7 fathoms of an island or wreck.';
   else if(s.away)error='The longboat is already away.';
   else if(['timber','treasure','salvage'].indexOf(m.job)<0)error='Unknown away job.';
   else if(p.kind==='wreck'&&m.job!=='salvage')error='Only salvage can be gathered from this wreck.';
   else{var ids=Array.isArray(m.crewIds)?m.crewIds:[],party=s.crew.filter(function(c){return ids.indexOf(c.id)>=0&&!c.away&&c.rank>0;});if(party.length!==2)error='Choose two different crew, keeping the captain aboard.';else{party.forEach(function(c){c.away=true;});s.away={job:m.job,place:p.id,departAt:w.time,returnAt:w.time+22,crewIds:party.map(function(c){return c.id;})};log(s,w.time,'Brisk','Longboat away for '+m.job+'. Back in 22 seconds.','travel');}}
  }
  else if(m.type==='trade'){
   var p=near(s,'port');if(!p||!s.anchored)error='Drop anchor near a port to trade.';
   else if(m.item==='sell'){if(s.cargo<1)error='No spice cargo to sell.';else{var n=s.cargo;s.cargo=0;s.gold+=n*p.sell;xp(s,n*2);log(s,w.time,'Quartermaster','Sold '+n+' spice for '+(n*p.sell)+' gold.','reward');}}
   else if(m.item==='buy'){if(s.gold<p.buy*5)error='Not enough gold.';else if(s.cargo>45)error='Cargo hold full (50).';else{s.gold-=p.buy*5;s.cargo+=5;}}
   else if(m.item==='supplies'){if(s.gold<65)error='Need 65 gold.';else{s.gold-=65;s.food=100;s.ammo+=20;s.timber+=20;s.hull=Math.min(s.maxHull,s.hull+20);log(s,w.time,'Quartermaster','65 gold: provisions, shot, timber, and a quick patch.','reward');}}
   else error='Unknown trade.';
  }
  else if(m.type==='upgrade'){if(!s.anchored||!near(s,'port'))error='Upgrade at a port.';else if(s.gold<250)error='Need 250 gold.';else{s.gold-=250;s.maxHull+=25;s.hull=s.maxHull;xp(s,100);log(s,w.time,'Shipwright','Reinforced hull fitted. +25 max hull. +100 XP.','reward');}}
  else if(m.type==='mission'){var defs={courier:{id:'courier',title:'A Very Discreet Delivery',reward:180},timber:{id:'timber',title:'Wood You Kindly',reward:110},hunter:{id:'hunter',title:'Red Sky, Red Wake',reward:220},treasure:{id:'treasure',title:'Dead Men’s Loose Change',reward:160}};if(['courier','timber','hunter','treasure'].indexOf(m.id)<0)error='Unknown contract.';else if((s.missionsDone||[]).indexOf(m.id)>=0)error='This contract has already been paid.';else if(s.mission)error='Finish or abandon the current contract.';else{s.mission=defs[m.id];s.mission.start=s.kills;log(s,w.time,'Contract',s.mission.title+' accepted.','travel');}}
  else if(m.type==='abandon'){s.mission=null;}
  else if(m.type==='praise'){var c=s.crew.filter(function(c){return c.id===m.crewId;})[0];if(!c)error='Unknown crew.';else if(w.time-(c.lastPraise||-999)<15)error='Give them a watch to earn it.';else{c.lastPraise=w.time;c.preferences[c.task]=clamp((c.preferences[c.task]||0)+.35,0,6);s.morale=clamp(s.morale+1,0,100);log(s,w.time,c.name.split(' ')[0],'I’ll remember that, Captain.');}}
  else if(m.type!=='sync')error='Unknown command.';
  if(error)return {ok:false,error:error};mission(w,s);return result(ctx,w);
 },
 onTick:function(ctx){var w=ctx.sessionState,now=ctx.now-(ctx.pausedMs||0),dt=clamp((now-w.lastTick)/1000,0,2);w.lastTick=now;tick(w,dt,ctx.random);return result(ctx,w);}
};
