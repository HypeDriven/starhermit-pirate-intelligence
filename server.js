/* Pirate Intelligence. This file is run unchanged by StarHermit's Jint authority
   and the engine's local practice worker. All mutations are validated here. */
var TASKS = ['helm','lookout','guns','repair','cook','forage','rest'];
var PLACES = [
 {id:'saltwick',name:'Saltwick',kind:'port',x:-22,z:8,tag:'A respectable den of thieves',buy:8,sell:15},
 {id:'mossjaw',name:'Mossjaw Cay',kind:'island',x:12,z:17,tag:'Timber, treasure & terrible mosquitoes'},
 {id:'gallows',name:'Gallows Reach',kind:'port',x:25,z:-19,tag:'Rum dear. Manners optional.',buy:13,sell:23},
 {id:'rattle',name:'Rattlebone Isle',kind:'island',x:-22,z:-23,tag:'Something shiny under something dead'},
 {id:'wreck',name:'The Crooked Wreck',kind:'wreck',x:32,z:23,tag:'Salvage for the morally flexible'},
 {id:'brasshaven',name:'Brasshaven',kind:'port',x:-44,z:36,tag:'Canvas, foundries and ambitious invoices',buy:14,sell:10},
 {id:'winterwake',name:'Winterwake',kind:'port',x:38,z:-45,tag:'Cold water. Warm purses.',buy:24,sell:19},
 {id:'cinder',name:'Cinder Shoal',kind:'island',x:48,z:-2,tag:'Black sand and a sailor’s buried wages'},
 {id:'whisper',name:'Whispering Key',kind:'island',x:-45,z:-38,tag:'A grove that remembers every visitor'}
];

var GOODS = {
 spice:{name:'Spice',saltwick:[8,6],gallows:[26,23],brasshaven:[14,10],winterwake:[24,19]},
 cloth:{name:'Sailcloth',saltwick:[17,12],gallows:[10,8],brasshaven:[8,6],winterwake:[20,16]},
 medicine:{name:'Medicine',saltwick:[24,18],gallows:[35,29],brasshaven:[30,23],winterwake:[42,36]}
};
var FITTINGS = {
 hull:{name:'Reinforced hull',cost:250,max:3},sails:{name:'Cutlass canvas',cost:140,max:3},
 guns:{name:'Brass gun sights',cost:180,max:3},hold:{name:'Cargo racks',cost:120,max:3},
 berths:{name:'Decent hammocks',cost:100,max:3},pump:{name:'Bilge pump',cost:150,max:3}
};
var BOOK = {
 courier:{id:'courier',title:'A Very Discreet Delivery',desc:'Deliver 5 spice to Gallows Reach.',reward:180},
 timber:{id:'timber',title:'Wood You Kindly',desc:'Gather a stock of 50 timber.',reward:110},
 hunter:{id:'hunter',title:'Red Sky, Red Wake',desc:'Sink one hostile ship.',reward:220},
 treasure:{id:'treasure',title:'Dead Men’s Loose Change',desc:'Return from a treasure expedition.',reward:160},
 survey:{id:'survey',title:'Ink on the Chart',desc:'Visit every destination on the expanded chart.',reward:260},
 relief:{id:'relief',title:'The Apothecary’s Problem',desc:'Deliver 5 medicine to Gallows Reach.',reward:240},
 cloth:{id:'cloth',title:'Not a Stitch to Spare',desc:'Deliver 10 sailcloth to Saltwick.',reward:190},
 veteran:{id:'veteran',title:'A Reputation for Trouble',desc:'Defeat three raiders after accepting.',reward:420},
 daily:{id:'daily',title:'A Fresh Barrel of Trouble',desc:'Port job: bring 5 spice to the other port. One job per sea day.',reward:100}
};
function migrate(w){
 if(!w.markets)w.markets={saltwick:{spice:60,cloth:25,medicine:30},gallows:{spice:25,cloth:60,medicine:15}};
 PLACES.filter(function(p){return p.kind==='port';}).forEach(function(p){if(!w.markets[p.id])w.markets[p.id]={spice:40,cloth:40,medicine:25};});
 if(!w.raiders.some(function(e){return e.id==='lantern';})){w.raiders.push({id:'lantern',name:'The Taxman’s Lantern',npc:true,x:-32,z:26,homeX:-32,homeZ:26,hull:120,maxHull:120,heading:1,lastShot:w.time,respawn:0},{id:'frostbite',name:'The Frostbite',npc:true,x:34,z:-35,homeX:34,homeZ:-35,hull:150,maxHull:150,heading:2,lastShot:w.time,respawn:0});}
 if(w.marketWatch===undefined)w.marketWatch=Math.floor(w.time/60);
 Object.keys(w.ships).forEach(function(id){var s=w.ships[id];
  s.clock=w.time;if(!s.upgrades)s.upgrades={hull:0,sails:0,guns:0,hold:0,berths:0,pump:0};
  if(!s.goods)s.goods={cloth:0,medicine:0};
  if(!s.standing)s.standing={repairAt:75,restAt:70,avoidStorm:false,autoFire:true};
  if(!s.visited)s.visited=[];if(!s.badges)s.badges=[];if(!s.requests)s.requests=[];
  if(!s.reputation)s.reputation=0;if(!s.fire)s.fire=0;if(!s.leak)s.leak=0;
  if(!s.stats)s.stats={trades:0,expeditions:0,rescues:0};if(!s.stats.captures)s.stats.captures=0;if(!s.controlMode)s.controlMode='course';if(!s.rigDamage)s.rigDamage=0;
  if(!s.lastBrain)s.lastBrain={};if(!s.missionsDone)s.missionsDone=[];
  if(!s.dailyDone)s.dailyDone=[];
  s.crew.forEach(function(c){if(!c.contextPreferences)c.contextPreferences={};if(!c.injury)c.injury=0;if(!c.preferred)c.preferred='auto';if(!c.orderRevision)c.orderRevision=0;if(c.trust===undefined)c.trust=50;if(!c.bonds)c.bonds={};if(!c.stories)c.stories=[];if(!c.reason)c.reason='Following the standing directive.';});
 });
}
function holdSize(s){return 50+(s.upgrades.hold||0)*15;}
function usedHold(s){return s.cargo+s.goods.cloth+s.goods.medicine;}
function portPrice(w,p,good){var base=GOODS[good][p.id],stock=w.markets[p.id][good];var shift=Math.floor(w.time/240)>0?(stock<15?3:stock>65?-2:0):0;return {buy:Math.max(2,base[0]+shift),sell:Math.max(1,Math.min(base[0]-3,base[1]+shift))};}
function stationCount(s,task,except){return s.crew.filter(function(c){return c.id!==except&&!c.away&&c.task===task;}).length;}
function crewEffect(c){return (1-c.fatigue/250)*(1-c.injury/200)*(.9+c.trust/500);}
function taskEffect(s,task){var party=s.crew.filter(function(c){return !c.away&&c.task===task;});if(!party.length)return 0;var base=party.reduce(function(sum,c){return sum+crewEffect(c);},0)/party.length;return base*(party.length>1&&(party[0].bonds[party[1].id]||50)>=65?1.05:1);}
function capacity(task){return {helm:1,cook:1,lookout:2,guns:2,repair:2,forage:2,rest:6}[task]||0;}
function available(w,s,c){var tasks=emergency(w,s)?TASKS:c.ordinary;return tasks.filter(function(t){return t===c.task||stationCount(s,t,c.id)<capacity(t);});}
function contextKey(w,s){return s.directive+':'+(emergency(w,s)?'danger':'calm');}
function learn(w,s,c,task,amount){var key=contextKey(w,s);if(!c.contextPreferences[key])c.contextPreferences[key]={};c.contextPreferences[key][task]=clamp((c.contextPreferences[key][task]||0)+amount,-3,6);}
function reason(w,s,c,task){
 if(w.time<c.manualUntil)return 'Direct order takes priority until the next watch ('+Math.ceil(c.manualUntil-w.time)+'s).';
 if(c.injury>20&&task==='rest')return 'Recovering from an expedition injury.';
 if(task==='repair'&&(s.fire>0||s.leak>0))return s.fire>0?'Fighting the deck fire.':'Pumping and patching the bilge.';
 if(task==='rest'&&c.fatigue>=s.standing.restAt)return 'Fatigue has reached the captain’s rest threshold.';
 if(task==='helm'&&(s.destination||s.controlMode==='manual'))return 'The ship needs one sailor on the helm.';
 if(task==='repair'&&s.hull/s.maxHull*100<s.standing.repairAt)return 'Hull below the captain’s repair threshold.';
 if(task==='guns'&&emergency(w,s))return 'A hostile is close. Keeping the guns ready.';
 if(task==='cook'&&s.food<65)return 'Provisions are running down.';
 if(c.preferred===task)return 'Following a preferred duty from the orders book.';
 return 'Following '+s.directive+'; balancing learned habits with free stations.';
}
function coordinate(w,s){
 // Explicit captain orders and fresh model proposals reserve their stations first.
 var held=s.crew.filter(function(c){return !c.away&&(w.time<c.manualUntil||w.time-(s.lastBrain[c.id]===undefined?-999:s.lastBrain[c.id])<=18);});
 var counts={};held.forEach(function(c){counts[c.task]=(counts[c.task]||0)+1;c.reason=reason(w,s,c,c.task);});
 s.crew.forEach(function(c){if(c.away||held.indexOf(c)>=0)return;var t=choose(w,s,c,counts);c.brain='instinct';c.reason=reason(w,s,c,t);counts[t]=(counts[t]||0)+1;if(c.task!==t){c.task=t;log(s,w.time,c.name.split(' ')[0],crewSays(c,t));}});
 var needs=[];
 if((s.destination||s.controlMode==='manual')&&!stationCount(s,'helm',''))needs.push({task:'helm',text:'We need a helmsman before the ship can make way.'});
 if((s.fire>0||s.leak>0||s.hull<s.maxHull*.65)&&!stationCount(s,'repair',''))needs.push({task:'repair',text:s.fire>0?'Fire on deck: send someone to damage control.':s.leak>0?'Bilge rising: send someone to repairs.':'Hull needs a carpenter.'});
 if(s.food<35&&!stationCount(s,'cook',''))needs.push({task:'cook',text:'Galley unattended while provisions run low.'});
 if(!harbourSafe(s)&&w.raiders.some(function(e){return e.hull>0&&distance(s,e)<17;})&&!stationCount(s,'guns',''))needs.push({task:'guns',text:'No gun crew ready. Review the nearest threat.'});
 s.requests=needs.map(function(n){var candidate=s.crew.filter(function(c){return !c.away&&c.ordinary.indexOf(n.task)>=0;}).sort(function(a,b){return a.fatigue-b.fatigue;})[0];return {task:n.task,text:n.text,crewId:candidate?candidate.id:'',from:n.task==='repair'?'Peg':n.task==='cook'?'Tallow':n.task==='helm'?'Pip':'Fuse'};});
 s.crew.forEach(function(c){c.allowedTasks=available(w,s,c);});
}
function badge(s,time,id,text){if(s.badges.indexOf(id)>=0)return;s.badges.push(id);s.reputation+=10;log(s,time,'Captain’s log',text,'reward');}
function progress(w,s){
 if(s.visited.length>=PLACES.length)badge(s,w.time,'chart','Every corner of the chart has a story now.');
 if(s.stats.trades>0)badge(s,w.time,'trader','First honest profit. Approximately honest.');
 if(s.kills>0)badge(s,w.time,'raider','First enemy sunk. Your reputation has arrived.');
 if(s.stats.expeditions>=3)badge(s,w.time,'shore','Three expeditions returned with stories and all their boots.');
 if(s.gold>=1000)badge(s,w.time,'fortune','A thousand gold in the strongbox. Try not to tell everyone.');
}
function encounter(a){
 if(a.job==='timber')return {title:'The old grove',text:'Easy driftwood lies on the beach. An old grove inland promises more, but the ground is treacherous.',safe:'Take the driftwood · guaranteed timber',risk:'Enter the grove · extra timber, possible injury',skill:'Carpenter'};
 if(a.job==='treasure')return {title:'A chest below the tide',text:'A marked chest is wedged in a flooded cave. Loose coins glint safely on the ledge.',safe:'Take the loose coins · no injury risk',risk:'Dive for the chest · richer reward, possible injury',skill:'Navigator'};
 return {title:'The wreck’s powder room',text:'A sealed locker rattles below a damaged beam. Deck salvage is within easy reach.',safe:'Strip the deck · guaranteed supplies',risk:'Open the locker · extra shot, possible injury',skill:'Gunner'};
}
function expeditionChance(s,ids,job){var party=s.crew.filter(function(c){return ids.indexOf(c.id)>=0;}),skill=encounter({job:job}).skill,trained=party.some(function(c){return c.role===skill;}),bond=((party[0].bonds[party[1].id]||50)+(party[1].bonds[party[0].id]||50))/2;return clamp((trained?.88:.62)+(bond>=65?.05:0)-(party.some(function(c){return c.fatigue>75;})?.15:0)-(party.some(function(c){return c.injury>20;})?.10:0),.2,.95);}
function bondParty(s,party,amount,text){party.forEach(function(c){party.forEach(function(other){if(c.id!==other.id)c.bonds[other.id]=clamp((c.bonds[other.id]||50)+amount,0,100);});c.stories.push(text);if(c.stories.length>5)c.stories.shift();});}
function finishAway(w,s,random){
 var a=s.away,party=s.crew.filter(function(c){return a.crewIds.indexOf(c.id)>=0;}),trained=party.some(function(c){return c.role===encounter(a).skill;}),risk=a.choice==='risk',success=!risk||random<(a.successChance===undefined?(trained?.88:.62):a.successChance);
 s.away=null;party.forEach(function(c){c.away=false;c.fatigue=clamp(c.fatigue+8,0,100);cxp(c,18);});
 if(a.job==='timber'){var wood=25+(risk&&success?20:0);s.timber+=wood;log(s,w.time,'Peg',wood+' timber aboard. '+(risk?'That grove had opinions.':'Driftwood never argues.'),'reward');}
 else if(a.job==='treasure'){var gold=risk?(success?200:35):75;s.gold+=gold;s.completed.push('treasure');log(s,w.time,'Brisk',gold+' gold recovered. '+(risk?'The cave kept its dignity.':'A dry pair of boots is its own treasure.'),'reward');}
 else{s.ammo+=12+(risk&&success?14:0);s.timber+=10+(risk&&success?8:0);log(s,w.time,'Pip','Salvage aboard: shot, timber and a suspicious smell.','reward');}
 if(risk&&!success){var hurt=party[0];hurt.injury=clamp(hurt.injury+35,0,100);hurt.fatigue=clamp(hurt.fatigue+20,0,100);log(s,w.time,hurt.name.split(' ')[0],'Back aboard with a sprain. Rest or a port doctor will help.','danger');}
 bondParty(s,party,success?5:-2,(success?'Returned together from ':'Kept one another afloat at ')+(place(a.place)||{name:'the shore'}).name+'.');party.forEach(function(c){c.trust=clamp(c.trust+(success?1:0),0,100);});s.stats.expeditions++;s.reputation+=risk&&success?8:3;xp(s,35);
}

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
function xp(s,n){s.xp+=n;while(s.xp>=s.level*100){s.xp-=s.level*100;s.level++;s.maxHull+=10;s.hull=Math.min(s.maxHull,s.hull+15);log(s,s.clock||0,'Shipwright','Ship level '+s.level+'! More hull. More swagger.','reward');}}
function cxp(c,n){c.xp+=n;while(c.xp>=c.level*35){c.xp-=c.level*35;c.level++;}}
function harbourSafe(s){return !!(s.anchored&&near(s,'port'));}
function emergency(w,s){var enemy=false;for(var i=0;i<w.raiders.length;i++)if(!harbourSafe(s)&&w.raiders[i].hull>0&&distance(s,w.raiders[i])<15)enemy=true;var attacked=!harbourSafe(s)&&Object.keys(w.ships).some(function(id){var other=w.ships[id];return id!==s.id&&other.lastTarget===s.id&&w.time-other.lastShot<18&&distance(s,other)<17;});return s.hull<s.maxHull*.45||s.food<12||s.fire>15||s.leak>15||enemy||attacked;}
function canTask(w,s,c,task,issuer,override){if(TASKS.indexOf(task)<0||c.away)return false;if(c.ordinary.indexOf(task)>=0)return true;return (issuer==='morrow'||issuer==='brisk')&&!!override&&emergency(w,s);}
function crewSays(c,task){var lines={morrow:{helm:'My ship. My course. Brisk, try to look reassured.',rest:'The captain is thinking. With her eyes closed.'},brisk:{repair:'One patch now saves a very embarrassing swim.',lookout:'One eye on the horizon. The other on this lot.'},fuse:{guns:'A tiny fuse. A very big argument.',rest:'Wake me if anything explodes. Or before.'},peg:{repair:'I can fix this. Your manners remain beyond me.',forage:'Wood first. Conversation absolutely last.'},tallow:{cook:'Soup is ready. I decline to name the ingredients.',rest:'Stir the pot while I put my feet up.'},pip:{helm:'I know this route. I am still allowed to be nervous.',lookout:'I see land! Preferably the kind that stays still.'}};return lines[c.id]&&lines[c.id][task]||speak(task);}
function speak(task){return {helm:'Aye! Pointy end toward the profit.',lookout:'Eyes up, you magnificent scoundrels!',guns:'Permission to make a bloody great noise?',repair:'This hole was not in the original design.',cook:'Soup’s on! Best not ask what’s in it.',forage:'Back with wood. Or a new curse.',rest:'Wake me for treasure. Or a decent mutiny.'}[task];}
function choose(w,s,c,counts){
 var best='rest',score=-999,habits=c.contextPreferences[contextKey(w,s)]||{};
 for(var i=0;i<c.ordinary.length;i++){
  var t=c.ordinary[i];if(counts&&(counts[t]||0)>=capacity(t))continue;
  var v=t==='rest'?(c.fatigue>=s.standing.restAt?12:0)+(c.trust<35?2:0):1;
  if(t==='helm'&&(s.destination||s.controlMode==='manual'))v+=9;
  if(t==='lookout')v+=s.directive==='explore'?5:1;
  if(t==='guns')v+=(s.directive==='hunt'?6:0)+(w.raiders.some(function(e){return e.hull>0&&distance(s,e)<18;})?9:0);
  if(t==='repair')v+=(s.hull<s.maxHull*s.standing.repairAt/100?(s.directive==='survive'?12:9):0)+(s.fire+s.leak>0?20:0);
  if(t==='cook')v+=s.food<65?8:0;
  if(t==='forage')v+=s.anchored&&s.directive==='prosper'?3:0;
  if(c.injury>20&&t==='rest')v+=20;
  if(c.preferred===t)v+=3;
  v+=(c.preferences[t]||0)+(habits[t]||0);if(v>score){score=v;best=t;}
 }
 if(emergency(w,s)&&(s.hull<s.maxHull*.4||s.fire>20||s.leak>30)&&c.id!=='morrow'&&s.timber>0&&(!counts||(counts.repair||0)<2))best='repair';
 return best;
}
function windKnots(w){return Math.round(12+3*Math.sin(w.time/90)+(w.weather!=='Fair winds'?8:0));}
function view(w,id){var own=w.ships[id];if(own){own.inHarbour=harbourSafe(own);own.emergency=emergency(w,own);}return {type:'state',schema:1,featureVersion:2,time:w.time,day:Math.floor(w.time/240)+1,weather:w.weather,wind:Math.sin(w.time/240),windKnots:windKnots(w),places:PLACES,ships:Object.keys(w.ships).map(function(k){var s=w.ships[k];return {id:s.id,name:s.name,ownerName:s.ownerName,x:s.x,z:s.z,hull:s.hull,maxHull:s.maxHull,heading:s.heading,level:s.level,anchored:s.anchored,fire:s.fire||0,leak:s.leak||0,lastShot:s.lastShot,lastTarget:s.lastTarget||''};}),raiders:w.raiders,myShip:own||null,goods:GOODS,fittings:FITTINGS,contracts:BOOK,markets:w.markets,prices:PLACES.filter(function(p){return p.kind==='port';}).map(function(p){var prices={};Object.keys(GOODS).forEach(function(g){prices[g]=portPrice(w,p,g);});return {id:p.id,goods:prices};})};}
function result(ctx,w){var b=[];for(var i=0;i<ctx.players.length;i++)b.push({to:[ctx.players[i].id],data:view(w,ctx.players[i].id)});var keys=Object.keys(w.ships);for(var j=0;j<keys.length;j++){var s=w.ships[keys[j]];if(s.delegate&&ctx.players.some(function(p){return p.id===s.delegate;}))b.push({to:[s.delegate],data:{type:'brain_context',ownerId:s.id,time:w.time,ship:s,emergency:emergency(w,s),nearbyEnemies:w.raiders.filter(function(r){return r.hull>0&&distance(s,r)<17;}).map(function(r){return {name:r.name,hull:r.hull};})}});}return {ok:true,sessionState:w,broadcast:b};}
function near(s,kind){var best=null,d=999;for(var i=0;i<PLACES.length;i++){var p=PLACES[i],n=distance(s,p);if((!kind||p.kind===kind)&&n<d){d=n;best=p;}}return d<7?best:null;}
function mission(w,s){var m=s.mission;if(!m)return;var port=near(s,'port'),done=
 (m.id==='timber'&&s.timber>=50)||(m.id==='hunter'&&s.kills>m.start)||(m.id==='veteran'&&s.kills>=m.start+3)||
 (m.id==='courier'&&s.anchored&&port&&port.id==='gallows'&&s.cargo>=5)||
 (m.id==='treasure'&&s.completed.indexOf('treasure')>=0)||(m.id==='survey'&&s.visited.length>=PLACES.length)||
 (m.id==='relief'&&s.anchored&&port&&port.id==='gallows'&&s.goods.medicine>=5)||
 (m.id==='cloth'&&s.anchored&&port&&port.id==='saltwick'&&s.goods.cloth>=10)||
 (m.id==='daily'&&s.anchored&&port&&port.id===m.destination&&s.cargo>=5);
 if(done){if(m.id==='courier'||m.id==='daily')s.cargo-=5;if(m.id==='relief')s.goods.medicine-=5;if(m.id==='cloth')s.goods.cloth-=10;
 s.gold+=m.reward;xp(s,70);s.reputation+=15;
 if(m.id==='daily'){s.dailyDone.push(m.day);if(s.dailyDone.length>32)s.dailyDone.shift();}else s.missionsDone.push(m.id);
 log(s,w.time,'Contract',m.title+' complete! +'+m.reward+' gold.','reward');s.mission=null;}}
function finishBoarding(w,s,random){
 var b=s.boarding,e=w.raiders.filter(function(e){return e.id===b.target;})[0],party=s.crew.filter(function(c){return b.crewIds.indexOf(c.id)>=0;});
 s.boarding=null;party.forEach(function(c){c.away=false;c.fatigue=clamp(c.fatigue+15,0,100);});
 if(!e||e.hull<=0){log(s,w.time,'Brisk','Boarders recalled. That prize is already gone.');return;}
 e.boardedBy='';var success=random<b.chance;
 if(success){e.hull=0;e.respawn=w.time+120;s.gold+=200;s.timber+=15;s.ammo+=8;s.kills++;s.stats.captures++;s.reputation+=20;xp(s,100);bondParty(s,party,8,'Took '+e.name+' together.');log(s,w.time,'Brisk','Prize taken! 200 gold, timber and shot recovered.','reward');}
 else{party.forEach(function(c){c.injury=clamp(c.injury+20,0,100);});bondParty(s,party,2,'Survived the boarding of '+e.name+'.');log(s,w.time,'Brisk','Boarders repelled. Everyone made it back, somewhat bruised.','danger');}
}
function recoverShip(w,s){
 if(s.boarding){var target=w.raiders.filter(function(e){return e.id===s.boarding.target;})[0];if(target&&target.boardedBy===s.id)target.boardedBy='';}
 s.crew.forEach(function(c){if(c.away)c.injury=clamp(c.injury+10,0,100);c.away=false;});
 s.away=null;s.boarding=null;s.gold=Math.floor(s.gold*.75);s.hull=s.maxHull*.65;s.fire=0;s.leak=0;s.rigDamage=0;s.x=-24;s.z=8;s.anchored=true;s.destination=null;s.steerThrottle=0;s.steerTurn=0;s.steerUntil=w.time;
 log(s,w.time,'Harbourmaster','Crew recovered and towed home. Lost 25% gold. Try floating next time.','combat');
}
function fire(w,s,target,ammunition){
 var e=null;for(var i=0;i<w.raiders.length;i++)if(w.raiders[i].id===target)e=w.raiders[i];
 if(!e)e=Object.prototype.hasOwnProperty.call(w.ships,target)?w.ships[target]:null;if(!e||e.id===s.id||e.hull<=0)return 'No target afloat.';
 if(harbourSafe(s)||(!e.npc&&harbourSafe(e)))return 'Harbour guns protect anchored ships. Leave port before fighting.';
 if(['round','chain','grape'].indexOf(ammunition||'round')<0)return 'Unknown ammunition.';if(s.boarding)return 'Wait for the boarding party.';
 if(s.controlMode==='manual'&&Math.abs(Math.sin(Math.atan2(e.x-s.x,e.z-s.z)-s.heading))<.45)return 'Target outside the broadside arc. Turn your flank toward it.';
 if(distance(s,e)>17)return 'Out of range. Close to 170 m.';if(w.time-s.lastShot<7)return 'Cannons reloading.';if(s.ammo<2)return 'Out of shot. Resupply in port.';
 var g=s.crew.filter(function(c){return !c.away&&c.task==='guns';}).length;
 if(!g)return 'Put someone on the guns first.';
 s.lastShot=w.time;s.lastTarget=e.id;s.ammo-=2;var damage=14+g*5*taskEffect(s,'guns')+s.level*2+(s.upgrades.guns||0)*4;if(ammunition==='chain'){damage*=.5;e.rigDamage=Math.min(70,(e.rigDamage||0)+25);}if(ammunition==='grape'){damage*=.4;e.shock=Math.min(60,(e.shock||0)+20);}e.hull=Math.max(0,e.hull-damage);log(s,w.time,'Little Fuse','BOOM! '+e.name+' has fewer opinions now.','combat');
 if(e.hull<=0){s.kills++;s.reputation+=12;s.gold+=120;xp(s,65);log(s,w.time,'Mara','Send a boat for the spoils. +120 gold.','reward');if(e.npc)e.respawn=w.time+100;else recoverShip(w,e);}
 return null;
}
function tick(w,dt,random){
 w.time+=dt;if(Math.floor(w.time/60)>w.marketWatch){w.marketWatch=Math.floor(w.time/60);Object.keys(w.markets).forEach(function(p){Object.keys(GOODS).forEach(function(g){w.markets[p][g]=Math.min(90,w.markets[p][g]+5);});});}w.weather=Math.floor(w.time/180)%3===2?'Squall on the horizon':'Fair winds';
 var keys=Object.keys(w.ships);
 for(var k=0;k<keys.length;k++){
  var s=w.ships[keys[k]];s.clock=w.time;if(s.controlMode==='manual'&&w.time>=(s.steerUntil||0)&&s.steerThrottle){s.steerThrottle=0;s.anchored=true;}
  if(s.boarding&&w.time>=s.boarding.finishAt)finishBoarding(w,s,random);
  if(s.controlMode==='manual'&&!s.boarding&&!s.away&&w.time<(s.steerUntil||0)&&!s.anchored){
   s.heading+=(s.steerTurn||0)*dt*.6;var oldX=s.x,oldZ=s.z,wind=Math.sin(w.time/240),tail=.75+.25*Math.cos(s.heading-wind),speed=1.7*(1+s.upgrades.sails*.1)*(1-s.rigDamage/120)*tail*(.85+.15*windKnots(w)/12);
   s.x=clamp(s.x+Math.sin(s.heading)*speed*dt*(s.steerThrottle||0),-65,65);s.z=clamp(s.z+Math.cos(s.heading)*speed*dt*(s.steerThrottle||0),-65,65);
   var shore=near(s);if(shore&&shore.kind!=='wreck'&&distance(s,shore)<4.8){s.x=oldX;s.z=oldZ;s.steerThrottle=0;s.anchored=true;if(w.time-(s.lastGrounding===undefined?-999:s.lastGrounding)>10){s.lastGrounding=w.time;s.hull=Math.max(1,s.hull-1);log(s,w.time,'Pip','Mind the reef! Anchor down before we become scenery.','danger');}}if(shore&&distance(s,shore)<6.65&&s.visited.indexOf(shore.id)<0){s.visited.push(shore.id);s.reputation+=3;xp(s,15);log(s,w.time,'Pip','Charted '+shore.name+' from the helm.','travel');}
  }
  if(s.standing.avoidStorm&&s.destination){if(w.weather!=='Fair winds'&&!s.anchored){s.anchored=true;s.sheltered=true;log(s,w.time,'Pip','Holding position until the squall passes.');}else if(w.weather==='Fair winds'&&s.sheltered){s.anchored=false;s.sheltered=false;}}
  if(s.destination&&!s.anchored){var p=place(s.destination);if(!p){var targetId=s.destination.slice(5);p=w.ships[targetId]||w.raiders.filter(function(e){return e.id===targetId&&e.hull>0;})[0];}if(!p){s.destination=null;s.anchored=true;continue;}var d=distance(s,p),helm=s.crew.some(function(c){return c.task==='helm'&&!c.away;});var speed=(s.directive==='explore'?2.1:1.7)*(1+s.level*.03)*(1+s.upgrades.sails*.10)*(1-Math.min(.4,s.leak/200))*(1-s.rigDamage/120),step=helm?Math.min(Math.max(0,d-6.5),dt*speed):0;s.heading=Math.atan2(p.x-s.x,p.z-s.z);if(d>6.5){s.x+=(p.x-s.x)/d*step;s.z+=(p.z-s.z)/d*step;}if(d<=6.65){s.anchored=true;s.destination=null;log(s,w.time,'Pip','Anchor down at '+p.name+'. Mostly on purpose.','travel');if(s.visited.indexOf(p.id)<0){s.visited.push(p.id);s.reputation+=3;xp(s,15);}}}
  s.food=Math.max(0,s.food-dt*.025);s.morale=clamp(s.morale+(s.food>0?.008:-.1)*dt,0,100);
  for(var j=0;j<s.crew.length;j++){var c=s.crew[j];if(c.away)continue;c.fatigue=clamp(c.fatigue+(c.task==='rest'?-.4*(1+s.upgrades.berths*.25):.028)*dt,0,100);if(c.task==='repair'&&s.timber>=.04*dt&&s.hull<s.maxHull){s.hull=Math.min(s.maxHull,s.hull+dt*.3*(1+c.level*.1)*crewEffect(c));s.timber-=dt*.04;}if(c.task==='cook'&&s.food<85)s.food=Math.min(85,s.food+dt*.035*crewEffect(c));if(c.task==='rest'&&c.injury>0)c.injury=Math.max(0,c.injury-dt*.08*(1+s.upgrades.berths*.4));cxp(c,dt*.07);
  }
  var repairers=stationCount(s,'repair','');
  if(repairers&&s.timber>0){s.fire=Math.max(0,s.fire-dt*repairers*1.5);s.leak=Math.max(0,s.leak-dt*repairers*(1+s.upgrades.pump*.5));s.rigDamage=Math.max(0,s.rigDamage-dt*repairers*.4);}
  if(s.fire>0||s.leak>0)s.hull=Math.max(1,s.hull-dt*(s.fire*.002+s.leak*.001/(1+s.upgrades.pump)));
  if(Math.floor(w.time/8)!==Math.floor((w.time-dt)/8))coordinate(w,s);
  if(s.away&&w.time>=s.away.returnAt)finishAway(w,s,random);
  if(s.standing.autoFire&&s.directive==='hunt'&&Math.floor(w.time/9)!==Math.floor((w.time-dt)/9)){for(var r=0;r<w.raiders.length;r++)if(w.raiders[r].hull>0&&distance(s,w.raiders[r])<17){fire(w,s,w.raiders[r].id);break;}}
  if(w.weather!=='Fair winds'&&!s.anchored)s.hull=Math.max(1,s.hull-.06*dt);
  mission(w,s);progress(w,s);
 }
 for(var r=0;r<w.raiders.length;r++){var e=w.raiders[r];if(e.hull<=0){if(w.time>=e.respawn){e.hull=e.maxHull;e.rigDamage=0;e.shock=0;e.boardedBy='';e.x=e.homeX;e.z=e.homeZ;}continue;}e.x+=Math.sin(w.time*.02+r)*dt*.12*(1-(e.rigDamage||0)/100);e.z+=Math.cos(w.time*.025+r)*dt*.12;for(var k=0;k<keys.length;k++){var s=w.ships[keys[k]];if(!harbourSafe(s)&&distance(s,e)<14&&w.time-e.lastShot>12){s.hull=Math.max(0,s.hull-5);s.leak=Math.min(100,s.leak+2);if(random<.2)s.fire=Math.min(100,s.fire+8);e.lastShot=w.time;e.lastTarget=s.id;log(s,w.time,'Little Fuse','Incoming! They’ve scratched the bloody paint!','combat');if(s.hull<=0)recoverShip(w,s);}}}
}
globalThis.game={
 persistent:true,tickRateHz:4,replays:true,queues:[{key:'free-sea',teams:1,teamSize:8}],
 createSession:function(ctx){
  var w=ctx.sessionState;
  if(!w||w.schema!==1){w={schema:1,time:0,lastTick:ctx.now-(ctx.pausedMs||0),weather:'Fair winds',ships:{},raiders:[{id:'redwake',name:'The Red Wake',npc:true,x:8,z:-6,homeX:8,homeZ:-6,hull:90,maxHull:90,heading:2,lastShot:0,respawn:0},{id:'taxman',name:'The Tax Collector',npc:true,x:24,z:6,homeX:24,homeZ:6,hull:130,maxHull:130,heading:1,lastShot:0,respawn:0}]};}
  migrate(w);w.lastTick=ctx.now-(ctx.pausedMs||0);for(var i=0;i<ctx.players.length;i++)if(!w.ships[ctx.players[i].id])w.ships[ctx.players[i].id]=newShip(ctx.players[i].id,ctx.players[i].displayName||ctx.players[i].name,i);migrate(w);Object.keys(w.ships).forEach(function(id){var s=w.ships[id];s.steerUntil=w.time;s.steerThrottle=0;s.steerTurn=0;if(s.controlMode==='manual')s.anchored=true;});return result(ctx,w);
 },
 onMembershipChange:function(ctx){var w=ctx.sessionState;if(ctx.membership.change==='joined'&&!w.ships[ctx.membership.userId]){if(Object.keys(w.ships).length>=16)return {ok:false,error:'This sea has room for 16 captains.'};w.ships[ctx.membership.userId]=newShip(ctx.membership.userId,ctx.membership.name,Object.keys(w.ships).length);}migrate(w);return result(ctx,w);},
 onPlayerMessage:function(ctx){
  var w=ctx.sessionState;migrate(w);var m=ctx.message.data,id=ctx.message.from,s=w.ships[id];
  if(!m||typeof m!=='object'||typeof m.type!=='string')return {ok:false,error:'Invalid command.'};
  if(m.type==='snapshot'&&ctx.sessionId==='brine-local')return {ok:true,broadcast:[{to:[id],data:{type:'snapshot',world:w}}]};
  if(m.type==='sync')return result(ctx,w);
  if(m.type==='decision'&&m.ownerId!==id){s=w.ships[m.ownerId];if(!s||s.delegate!==id)return {ok:false,error:'This captain has not delegated crew decisions to you.'};}
  if(!s)return {ok:false,error:'No ship assigned to this participant.'};
  var error=null;
  if(m.type==='sail'){var p=place(m.destination);if(!p)error='Unknown destination.';else if(s.away||s.boarding)error='Wait for the away party to return.';else{s.controlMode='course';s.destination=p.id;s.sheltered=false;s.anchored=false;if(w.time>=s.crew[0].manualUntil)s.crew[0].task='helm';log(s,w.time,'Mara','Set course for '+p.name+'. Try not to hit it.','travel');}}
  else if(m.type==='pursue'){var target=(Object.prototype.hasOwnProperty.call(w.ships,m.target)?w.ships[m.target]:null)||w.raiders.filter(function(e){return e.id===m.target&&e.hull>0;})[0];if(!target||target.id===s.id||!Number.isFinite(target.x))error='No target afloat.';else if(s.away||s.boarding)error='Wait for the away party.';else{s.controlMode='course';s.destination='ship:'+target.id;s.anchored=false;if(w.time>=s.crew[0].manualUntil)s.crew[0].task='helm';log(s,w.time,'Mara','Close with '+target.name+'. Looking charming is optional.','combat');}}
  else if(m.type==='anchor'){s.sheltered=false;s.anchored=!s.anchored;if(!s.anchored&&!s.destination)s.anchored=true;log(s,w.time,'Brisk',s.anchored?'Anchor down. Mind your toes.':'Heave away!');}
  else if(m.type==='directive'){if(['prosper','hunt','explore','survive'].indexOf(m.value)<0)error='Unknown directive.';else{s.directive=m.value;log(s,w.time,'Captain’s orders','Standing directive: '+m.value+'.');coordinate(w,s);}}
  else if(m.type==='order'||m.type==='decision'){
   var c=s.crew.filter(function(c){return c.id===m.crewId;})[0];
   if(!c)error='Unknown crew member.';
   else if(m.type==='decision'&&w.time<(s.lastBrain[c.id]===undefined?-999:s.lastBrain[c.id])+5)error='Decision already made for this watch.';
   else if(m.type==='decision'&&w.time<c.manualUntil)error='A direct order is still in effect.';
   else if(m.type==='decision'&&available(w,s,c).indexOf(m.task)<0)error='That duty station is already staffed.';
   else if(!canTask(w,s,c,m.task,m.issuer,!!m.override))error='Outside '+c.role.toLowerCase()+" duties. An officer may override only during danger (low hull, low food, or nearby enemy).";
   else{c.task=m.task;if(m.type==='order'){c.manualUntil=w.time+35;c.orderRevision++;c.reason='Following a direct captain’s order.';learn(w,s,c,m.task,.5);c.preferences[m.task]=clamp((c.preferences[m.task]||0)+.7,0,6);c.memories.push({task:m.task,directive:s.directive,emergency:emergency(w,s),text:String(m.note||'Direct order: '+m.task).slice(0,120)});if(c.memories.length>10)c.memories.shift();log(s,w.time,c.name.split(' ')[0],(m.override?'By the first mate’s warrant! ':'')+crewSays(c,m.task));}else{s.lastBrain[c.id]=w.time;c.reason='Model proposal validated against duties and the current watch.';c.brain=m.source==='browser'&&id===s.id?'browser LLM':'local LLM';log(s,w.time,c.name.split(' ')[0],crewSays(c,m.task));}}
  }
  else if(m.type==='delegate'){if(typeof m.userId!=='string'||m.userId.length>80)error='Invalid brain delegate ID.';else{s.delegate=m.userId;log(s,w.time,'Brisk',m.userId?'Local brain officer authorised for crew decisions.':'Local brain officer disconnected.');}}
  else if(m.type==='rename'){var name=typeof m.name==='string'?m.name.trim():'';if(name.length<3||name.length>40||/[\x00-\x1f\x7f]/.test(name))error='A ship name needs 3 to 40 printable characters.';else{s.name=name;log(s,w.time,'Captain’s log','Rechristened '+name+'. Keep the old name away from the taxman.');}}
  else if(m.type==='helm-mode'){
   if(s.away||s.boarding)error='Wait for all crew to return before taking the helm.';
   else if(m.mode!=='manual'&&m.mode!=='course')error='Unknown helm mode.';
   else{s.controlMode=m.mode;s.destination=null;s.anchored=true;s.steerTurn=0;s.steerThrottle=0;if(m.mode==='manual'){s.crew[0].task='helm';s.crew[0].manualUntil=w.time+35;s.crew[0].orderRevision++;}log(s,w.time,'Mara',m.mode==='manual'?'My watch. Hands on the helm.':'Back to charted courses.');}
  }
  else if(m.type==='helm-input'){
   if(s.controlMode!=='manual'||s.away||s.boarding)error='Take the manual helm with the crew aboard first.';
   else if([-1,0,1].indexOf(m.turn)<0||[0,1].indexOf(m.throttle)<0)error='Invalid helm input.';
   else{s.steerTurn=m.turn;s.steerThrottle=m.throttle;s.steerUntil=w.time+2;s.anchored=m.throttle===0;}
  }
  else if(m.type==='board'){
   var e=w.raiders.filter(function(e){return e.id===m.target&&e.hull>0;})[0],ids=Array.isArray(m.crewIds)?m.crewIds:[],party=s.crew.filter(function(c){return ids.indexOf(c.id)>=0&&c.rank>0&&!c.away&&c.injury<40;});
   if(s.away||s.boarding)error='The ship needs its away crew back first.';
   else if(!e)error='Boarding is available against raiders only.';
   else if(harbourSafe(s))error='Leave the harbour before boarding a raider.';
   else if(distance(s,e)>7)error='Close within 70 m to board.';
   else if(e.hull>e.maxHull*.45)error='Weaken the raider below 45% hull before boarding.';
   else if(e.boardedBy)error='Another captain is already boarding that prize.';
   else if(ids.length!==2||party.length!==2)error='Choose two fit sailors and keep the captain aboard.';
   else{var chance=clamp(.60+(party.some(function(c){return c.id==='brisk'||c.id==='fuse';})?.15:0)+(e.shock||0)/300-(party.some(function(c){return c.fatigue>75;})?.15:0),.2,.95);party.forEach(function(c){c.away=true;});e.boardedBy=s.id;s.boarding={target:e.id,crewIds:ids,chance:chance,finishAt:w.time+12};s.anchored=true;s.destination=null;log(s,w.time,'Brisk','Grapples away. The boarding party returns in 12 seconds.','combat');}
  }
  else if(m.type==='fire')error=fire(w,s,m.target,m.ammunition);
  else if(m.type==='away'){
   var p=near(s);if(!s.anchored||!p||p.kind==='port')error='Anchor within 70 m of an island or wreck.';
   else if(s.away||s.boarding)error='The longboat or boarding party is already away.';
   else if(['timber','treasure','salvage'].indexOf(m.job)<0)error='Unknown away job.';
   else if(p.kind!=='wreck'&&m.job==='salvage')error='Salvage is available at the Crooked Wreck.';
   else if(p.kind==='wreck'&&m.job!=='salvage')error='Only salvage can be gathered from this wreck.';
   else{var ids=Array.isArray(m.crewIds)?m.crewIds:[],party=s.crew.filter(function(c){return ids.indexOf(c.id)>=0&&!c.away&&c.rank>0;});if(party.length!==2||ids.length!==2)error='Choose two different crew, keeping the captain aboard.';else{if(party.some(function(c){return c.injury>40;}))return {ok:false,error:'An injured sailor needs rest or a port doctor before another expedition.'};party.forEach(function(c){c.away=true;});s.away={job:m.job,place:p.id,departAt:w.time,returnAt:w.time+22,choice:null,successChance:expeditionChance(s,ids,m.job),encounterAt:w.time+6,encounter:encounter({job:m.job}),crewIds:party.map(function(c){return c.id;})};log(s,w.time,'Brisk','Longboat away for '+m.job+'. Back in 22 seconds.','travel');}}
  }
  else if(m.type==='expedition-choice'){
   if(!s.away)error='No expedition is underway.';
   else if(w.time<s.away.encounterAt)error='The longboat has not reached the encounter yet.';
   else if(s.away.choice)error='The expedition has already made its choice.';
   else if(['safe','risk'].indexOf(m.choice)<0)error='Choose a safe or risky approach.';
   else{s.away.choice=m.choice;if(m.choice==='risk')s.away.returnAt+=8;log(s,w.time,'Longboat',m.choice==='risk'?'Taking the risky path. Back eight seconds later.':'Taking the safe haul. All boots accounted for.');}
  }
  else if(m.type==='trade'){
   var p=near(s,'port');if(!p||!s.anchored)error='Drop anchor near a port to trade.';
   else if(m.item==='supplies'){if(s.gold<65)error='Need 65 gold.';else{s.gold-=65;s.food=100;s.ammo+=20;s.timber+=20;s.hull=Math.min(s.maxHull,s.hull+20);log(s,w.time,'Quartermaster','65 gold: provisions, shot, timber, and a quick patch.','reward');}}
   else if(m.item==='buy'||m.item==='sell'){
    var good=m.good===undefined?'spice':m.good;
    if(!Object.prototype.hasOwnProperty.call(GOODS,good))error='Unknown cargo.';
    else{var price=portPrice(w,p,good),count=good==='spice'?s.cargo:s.goods[good];
     if(m.item==='buy'){if(s.gold<price.buy*5)error='Not enough gold.';else if(usedHold(s)+5>holdSize(s))error='Cargo hold full.';else if(w.markets[p.id][good]<5)error='Port stock is low. Merchants replenish five crates each minute.';else{s.gold-=price.buy*5;if(good==='spice')s.cargo+=5;else s.goods[good]+=5;w.markets[p.id][good]-=5;s.stats.trades++;}}
     else if(count<1)error='No '+GOODS[good].name.toLowerCase()+' cargo to sell.';
     else{if(good==='spice')s.cargo=0;else s.goods[good]=0;s.gold+=count*price.sell;w.markets[p.id][good]=Math.min(100,w.markets[p.id][good]+count);s.stats.trades++;xp(s,count*2);log(s,w.time,'Quartermaster','Sold '+count+' '+GOODS[good].name.toLowerCase()+' for '+(count*price.sell)+' gold.','reward');}
    }
   }else error='Unknown trade.';
  }
  else if(m.type==='service'){
   if(!s.anchored||!near(s,'port'))error='Port services need a safe anchorage.';
   else if(m.service==='doctor'){if(s.away||s.boarding)error='Wait for the expedition before treating the crew.';else if(s.gold<40)error='Need 40 gold.';else{s.gold-=40;s.crew.forEach(function(c){if(c.injury>0)c.trust=clamp(c.trust+3,0,100);c.injury=0;c.fatigue=Math.max(0,c.fatigue-20);});log(s,w.time,'Port doctor','Every sprain tended. Try using the stairs next time.','reward');}}
   else if(m.service==='repairs'){var cost=Math.max(10,Math.ceil((s.maxHull-s.hull)*.7+s.fire+s.leak+s.rigDamage*.5));if(s.gold<cost)error='Need '+cost+' gold.';else{s.gold-=cost;s.hull=s.maxHull;s.fire=0;s.leak=0;s.rigDamage=0;log(s,w.time,'Shipwright','Hull patched, bilge dry and suspicious smoke extinguished.','reward');}}
   else error='Unknown port service.';
  }
  else if(m.type==='upgrade'){
   var fitting=m.fitting===undefined?'hull':m.fitting;
   if(!Object.prototype.hasOwnProperty.call(FITTINGS,fitting))error='Unknown ship fitting.';
   else if(!s.anchored||!near(s,'port'))error='Upgrade at a port.';
   else{var def=FITTINGS[fitting],level=s.upgrades[fitting]||0,cost=def.cost*(level+1);if(level>=def.max)error='This fitting is fully upgraded.';else if(s.gold<cost)error='Need '+cost+' gold.';else{s.gold-=cost;s.upgrades[fitting]=level+1;if(fitting==='hull'){s.maxHull+=25;s.hull=s.maxHull;}xp(s,100);log(s,w.time,'Shipwright',def.name+' fitted: level '+(level+1)+'.','reward');}}
  }
  else if(m.type==='mission'){
   if(!Object.prototype.hasOwnProperty.call(BOOK,m.id))error='Unknown contract.';
   else if(m.id!=='daily'&&s.missionsDone.indexOf(m.id)>=0)error='This contract has already been paid.';
   else if(s.mission)error='Finish or abandon the current contract.';
   else{var def=BOOK[m.id],port=near(s,'port'),day=Math.floor(w.time/240);
    if(m.id==='daily'&&(!s.anchored||!port))error='Pick up the daily job at either port.';
    else if(m.id==='daily'&&s.dailyDone.indexOf(day)>=0)error='Today’s port job is already paid. Return next sea day.';
    else{s.mission={id:def.id,title:def.title,reward:def.reward,start:s.kills};if(m.id==='daily'){s.mission.day=day;s.mission.destination=port.id==='saltwick'?'gallows':'saltwick';}log(s,w.time,'Contract',s.mission.title+' accepted.','travel');}
   }
  }
  else if(m.type==='abandon'){s.mission=null;}
  else if(m.type==='standing'){
   var rule=m.rule,value=m.value;
   if(rule==='repairAt'&&[50,75,90].indexOf(value)>=0)s.standing.repairAt=value;
   else if(rule==='restAt'&&[60,70,85].indexOf(value)>=0)s.standing.restAt=value;
   else if((rule==='avoidStorm'||rule==='autoFire')&&typeof value==='boolean')s.standing[rule]=value;
   else error='Unknown standing order or value.';
   if(!error){s.crew.forEach(function(c){c.orderRevision++;});coordinate(w,s);log(s,w.time,'Orders book','Standing orders updated.');}
  }
  else if(m.type==='habit'){
   var c=s.crew.filter(function(c){return c.id===m.crewId;})[0];
   if(!c)error='Unknown crew member.';
   else if(m.action==='prefer'&&(m.task==='auto'||c.ordinary.indexOf(m.task)>=0)){c.orderRevision++;c.preferred=m.task;c.reason='Preferred duty updated in the orders book.';}
   else if(m.action==='forget'&&TASKS.indexOf(m.task)>=0){c.orderRevision++;delete c.preferences[m.task];Object.keys(c.contextPreferences).forEach(function(k){delete c.contextPreferences[k][m.task];});log(s,w.time,c.name.split(' ')[0],'Clean slate on '+m.task+', Captain.');}
   else if(m.action==='discourage'){if(w.time-(c.lastFeedback===undefined?-999:c.lastFeedback)<15)error='Give the sailor a watch before more feedback.';else{c.lastFeedback=w.time;c.orderRevision++;c.trust=clamp(c.trust-1,0,100);c.preferences[c.task]=clamp((c.preferences[c.task]||0)-.5,-3,6);learn(w,s,c,c.task,-.5);log(s,w.time,c.name.split(' ')[0],'Understood. Less of that in this situation.');}}
   else error='Unknown habit change.';
  }
  else if(m.type==='praise'){var c=s.crew.filter(function(c){return c.id===m.crewId;})[0];if(!c)error='Unknown crew.';else if(w.time-(c.lastPraise===undefined?-999:c.lastPraise)<15)error='Give them a watch to earn it.';else{c.lastPraise=w.time;c.orderRevision++;c.trust=clamp(c.trust+2,0,100);learn(w,s,c,c.task,.2);c.preferences[c.task]=clamp((c.preferences[c.task]||0)+.35,0,6);s.morale=clamp(s.morale+1,0,100);log(s,w.time,c.name.split(' ')[0],'I’ll remember that, Captain.');}}
  else if(m.type!=='sync')error='Unknown command.';
  if(error)return {ok:false,error:error};mission(w,s);progress(w,s);s.crew.forEach(function(c){c.allowedTasks=available(w,s,c);});return result(ctx,w);
 },
 onTick:function(ctx){var w=ctx.sessionState;migrate(w);var now=ctx.now-(ctx.pausedMs||0),dt=clamp((now-w.lastTick)/1000,0,2);w.lastTick=now;tick(w,dt,ctx.random);return result(ctx,w);}
};
