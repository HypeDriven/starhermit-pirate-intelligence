import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
function voyage(saved){
 const scope=vm.createContext({});vm.runInContext(source,scope);const game=scope.game;
 const ctx={now:100000,pausedMs:0,random:.8,sessionId:'voyage-test',players:[{id:'captain',name:'Captain'},{id:'stranger',name:'Stranger'}],sessionState:saved||null};
 ctx.sessionState=game.createSession(ctx).sessionState;
 return {game,ctx,get world(){return ctx.sessionState;},get ship(){return ctx.sessionState.ships.captain;},
 command(data,from='captain'){const input=JSON.parse(JSON.stringify(ctx));input.message={from,data};const result=game.onPlayerMessage(input);if(result.ok&&result.sessionState)ctx.sessionState=result.sessionState;return result;},
 tick(n=1){for(let i=0;i<n;i++){ctx.now+=1000;ctx.sessionState=game.onTick(JSON.parse(JSON.stringify(ctx))).sessionState;}},
 port(id='saltwick'){const p=scope.PLACES.find(p=>p.id===id);this.ship.x=p.x;this.ship.z=p.z;this.ship.anchored=true;this.ship.destination=null;},
 snapshot(){return JSON.parse(JSON.stringify(ctx.sessionState));}
 };
}
test('old snapshots migrate without losing cargo, money, orders or crew memories',()=>{
 const f=voyage();f.command({type:'order',crewId:'peg',task:'rest',issuer:'morrow',note:'Old captain’s order'});const saved=f.snapshot();const s=saved.ships.captain;
 for(const key of ['goods','upgrades','standing','visited','badges','requests','stats','dailyDone'])delete s[key];
 for(const c of s.crew){delete c.contextPreferences;delete c.preferred;delete c.injury;}
 const loaded=voyage(saved);assert.equal(loaded.ship.gold,340);assert.equal(loaded.ship.cargo,5);assert.equal(loaded.ship.crew[3].memories[0].text,'Old captain’s order');assert.equal(loaded.ship.standing.restAt,70);assert.equal(loaded.ship.crew[3].manualUntil,35);
});
test('automatic watches respect station capacity and explain assignments',()=>{
 const f=voyage();f.tick(8);const tasks=f.ship.crew.map(c=>c.task);
 assert.ok(tasks.filter(t=>t==='helm').length<=1);assert.ok(tasks.filter(t=>t==='cook').length<=1);assert.ok(tasks.filter(t=>t==='forage').length<=2);
 assert.ok(f.ship.crew.every(c=>c.reason&&c.allowedTasks.includes(c.task)));
});
test('direct rest orders are not silently replaced to satisfy a sailing directive',()=>{
 const f=voyage();for(const c of f.ship.crew)assert.equal(f.command({type:'order',crewId:c.id,task:'rest',issuer:'morrow'}).ok,true);
 const {x,z}=f.ship;assert.equal(f.command({type:'sail',destination:'mossjaw'}).ok,true);f.tick(10);
 assert.equal(f.ship.x,x);assert.equal(f.ship.z,z);assert.ok(f.ship.crew.every(c=>c.task==='rest'));assert.ok(f.ship.requests.some(r=>r.task==='helm'));
 f.tick(31);assert.ok(f.ship.x!==x||f.ship.z!==z);
});
test('new model proposals cannot take a station reserved by another sailor',()=>{
 const f=voyage();f.command({type:'order',crewId:'tallow',task:'rest',issuer:'morrow'});f.command({type:'order',crewId:'morrow',task:'helm',issuer:'morrow'});
 assert.equal(f.command({type:'decision',ownerId:'captain',crewId:'pip',task:'helm'}).ok,false);
});
test('contextual correction and forgetting affect only the authenticated captain’s crew',()=>{
 const f=voyage();const peg=()=>f.ship.crew.find(c=>c.id==='peg');
 f.command({type:'order',crewId:'peg',task:'repair',issuer:'morrow'});assert.equal(peg().contextPreferences['prosper:calm'].repair,.5);
 assert.equal(f.command({type:'habit',crewId:'peg',action:'discourage'}).ok,true);assert.equal(peg().contextPreferences['prosper:calm'].repair,0);
 assert.equal(f.command({type:'habit',crewId:'peg',action:'discourage'}).ok,false);
 f.command({type:'habit',crewId:'peg',action:'prefer',task:'forage'});assert.equal(peg().preferred,'forage');
 assert.equal(f.command({type:'habit',crewId:'peg',action:'prefer',task:'guns'}).ok,false);
 f.command({type:'habit',crewId:'peg',action:'forget',task:'repair'});assert.equal(peg().preferences.repair,undefined);
 const stranger=f.world.ships.stranger.crew.find(c=>c.id==='peg');assert.equal(stranger.preferred,'auto');
});
test('standing orders validate all values and do not overwrite direct orders',()=>{
 const f=voyage();f.command({type:'order',crewId:'peg',task:'rest',issuer:'morrow'});
 assert.equal(f.command({type:'standing',rule:'repairAt',value:90}).ok,true);assert.equal(f.ship.crew[3].task,'rest');
 assert.equal(f.command({type:'standing',rule:'repairAt',value:900}).ok,false);assert.equal(f.command({type:'standing',rule:'__proto__',value:true}).ok,false);
});
test('safe expeditions resolve once without an action; specialist risk earns extra loot',()=>{
 const f=voyage();f.ship.x=12;f.ship.z=17;let before=f.ship.timber;
 assert.equal(f.command({type:'away',job:'timber',crewIds:['peg','pip']}).ok,true);assert.equal(f.command({type:'expedition-choice',choice:'risk'}).ok,false);
 f.tick(23);assert.equal(f.ship.away,null);assert.ok(f.ship.timber>=before+24);assert.equal(f.ship.stats.expeditions,1);assert.ok(f.ship.crew.every(c=>c.injury===0));
 before=f.ship.timber;f.command({type:'away',job:'timber',crewIds:['peg','pip']});f.tick(6);assert.equal(f.command({type:'expedition-choice',choice:'risk'}).ok,true);assert.equal(f.command({type:'expedition-choice',choice:'risk'}).ok,false);
 f.tick(24);assert.ok(f.ship.timber>=before+44);assert.equal(f.ship.stats.expeditions,2);f.tick(30);assert.equal(f.ship.stats.expeditions,2);
});
test('failed risky expeditions cause recoverable injuries, with validated port treatment',()=>{
 const f=voyage();f.ship.x=12;f.ship.z=17;f.command({type:'away',job:'timber',crewIds:['brisk','pip']});f.tick(6);f.command({type:'expedition-choice',choice:'risk'});f.tick(24);
 const hurt=f.ship.crew.find(c=>c.id==='brisk');assert.ok(hurt.injury>0);assert.equal(f.command({type:'service',service:'doctor'}).ok,false);
 f.port();const money=f.ship.gold;assert.equal(f.command({type:'service',service:'doctor'}).ok,true);assert.equal(f.ship.gold,money-40);assert.ok(f.ship.crew.every(c=>c.injury===0));
});
test('cargo classes share hold capacity and cannot be traded for instant same-port profit',()=>{
 const f=voyage();f.port();for(const good of ['spice','cloth','medicine']){f.ship.gold=1000;f.ship.cargo=0;f.ship.goods={cloth:0,medicine:0};assert.equal(f.command({type:'trade',item:'buy',good}).ok,true);assert.equal(f.command({type:'trade',item:'sell',good}).ok,true);assert.ok(f.ship.gold<1000);}
 f.ship.cargo=45;f.ship.goods.cloth=5;assert.equal(f.command({type:'trade',item:'buy',good:'medicine'}).ok,false);
 assert.equal(f.command({type:'trade',item:'buy',good:'__proto__'}).ok,false);
});
test('port stock is shared across captains and replenishes in world time',()=>{
 const f=voyage();f.port();f.ship.gold=10000;f.world.markets.saltwick.medicine=5;assert.equal(f.command({type:'trade',item:'buy',good:'medicine'}).ok,true);assert.equal(f.world.markets.saltwick.medicine,0);assert.equal(f.command({type:'trade',item:'buy',good:'medicine'}).ok,false);f.tick(60);assert.equal(f.world.markets.saltwick.medicine,5);
});
test('fittings enforce port, cost, level caps and actual cargo capacity',()=>{
 const f=voyage();assert.equal(f.command({type:'upgrade',fitting:'hold'}).ok,false);f.port();f.ship.gold=5000;
 for(let level=1;level<=3;level++){assert.equal(f.command({type:'upgrade',fitting:'hold'}).ok,true);assert.equal(f.ship.upgrades.hold,level);}
 assert.equal(f.command({type:'upgrade',fitting:'hold'}).ok,false);assert.equal(f.command({type:'upgrade',fitting:'__proto__'}).ok,false);
 f.ship.cargo=80;assert.equal(f.command({type:'trade',item:'buy'}).ok,true);assert.equal(f.ship.cargo,85);
});
test('fires and leaks activate emergency duties; repair stations and port services control them',()=>{
 const f=voyage();f.ship.fire=40;f.ship.leak=30;f.ship.hull=85;
 assert.equal(f.command({type:'order',crewId:'fuse',task:'repair',issuer:'brisk',override:true}).ok,true);f.tick(5);assert.ok(f.ship.fire<40);assert.ok(f.ship.leak<30);
 f.port();assert.equal(f.command({type:'service',service:'repairs'}).ok,true);assert.equal(f.ship.fire,0);assert.equal(f.ship.leak,0);assert.equal(f.ship.hull,f.ship.maxHull);
});
test('daily deliveries require a port, the other port, and a fresh sea day',()=>{
 const f=voyage();assert.equal(f.command({type:'mission',id:'daily'}).ok,false);f.port();assert.equal(f.command({type:'mission',id:'daily'}).ok,true);assert.equal(f.ship.mission.destination,'gallows');
 f.port('gallows');f.tick();assert.equal(f.ship.mission,null);assert.equal(f.ship.dailyDone.length,1);assert.equal(f.command({type:'mission',id:'daily'}).ok,false);
 f.tick(240);assert.equal(f.command({type:'mission',id:'daily'}).ok,true);assert.equal(f.ship.mission.destination,'saltwick');
});
test('visited destinations and milestones survive reload and never award twice',()=>{
 const f=voyage();f.command({type:'sail',destination:'mossjaw'});f.tick(30);assert.ok(f.ship.visited.includes('mossjaw'));
 f.port();f.command({type:'trade',item:'buy'});assert.equal(f.ship.badges.filter(b=>b==='trader').length,1);
 const restored=voyage(f.snapshot()),renown=restored.ship.reputation;restored.command({type:'trade',item:'sell'});assert.equal(restored.ship.reputation,renown);
 const view=restored.command({type:'sync'}).broadcast.find(b=>b.to[0]==='stranger').data;assert.equal(view.ships.find(s=>s.id==='captain').goods,undefined);assert.equal(view.myShip.id,'stranger');
});
test('prototype names cannot become naval targets or contaminate the world',()=>{
 const f=voyage();assert.equal(f.command({type:'fire',target:'__proto__'}).ok,false);assert.equal(f.command({type:'pursue',target:'constructor'}).ok,false);assert.equal(f.world.ships.captain.hull,100);
});
test('the expanded sea has nine destinations, four ports and a persistent raider fleet',()=>{
 const f=voyage();const state=f.command({type:'sync'}).broadcast[0].data;assert.equal(state.places.length,9);assert.equal(Object.keys(state.markets).length,4);assert.equal(state.raiders.length,4);
 const loaded=voyage(f.snapshot());assert.equal(loaded.world.raiders.length,4);loaded.port('winterwake');assert.equal(loaded.command({type:'trade',item:'buy',good:'cloth'}).ok,true);
});
test('manual helm uses bounded inputs, wind, dead-man timeout and world bounds',()=>{
 const f=voyage();assert.equal(f.command({type:'helm-input',turn:0,throttle:1}).ok,false);assert.equal(f.command({type:'helm-mode',mode:'manual'}).ok,true);
 assert.equal(f.command({type:'helm-input',turn:999,throttle:1}).ok,false);const z=f.ship.z;f.command({type:'helm-input',turn:0,throttle:1});f.tick();assert.ok(f.ship.z>z);f.tick(2);const stopped=f.ship.z;f.tick(5);assert.equal(f.ship.z,stopped);assert.equal(f.ship.anchored,true);
 f.ship.x=65;f.ship.heading=Math.PI/2;f.command({type:'helm-input',turn:0,throttle:1});f.tick();assert.equal(f.ship.x,65);
 const loaded=voyage(f.snapshot());assert.equal(loaded.ship.steerThrottle,0);assert.equal(loaded.ship.anchored,true);
});
test('manual broadside arcs and special ammunition affect real target state',()=>{
 const f=voyage();f.ship.x=8;f.ship.z=-3;f.command({type:'helm-mode',mode:'manual'});
 assert.equal(f.command({type:'fire',target:'redwake'}).ok,false);f.ship.heading=Math.PI/2;assert.equal(f.command({type:'fire',target:'redwake',ammunition:'chain'}).ok,true);assert.equal(f.world.raiders[0].rigDamage,25);
 f.tick(8);assert.equal(f.command({type:'fire',target:'redwake',ammunition:'grape'}).ok,true);assert.equal(f.world.raiders[0].shock,20);
});
test('boarding locks a weakened raider, returns crew and awards one prize',()=>{
 const f=voyage();f.ctx.random=.1;const target=f.world.raiders[0];f.ship.x=target.x;f.ship.z=target.z+3;
 assert.equal(f.command({type:'board',target:target.id,crewIds:['brisk','fuse']}).ok,false);target.hull=30;
 const start=f.ship.gold;assert.equal(f.command({type:'board',target:target.id,crewIds:['brisk','fuse']}).ok,true);
 assert.equal(f.command({type:'sail',destination:'saltwick'}).ok,false);assert.equal(f.command({type:'away',job:'timber',crewIds:['peg','pip']}).ok,false);
 const other=f.world.ships.stranger;other.x=target.x;other.z=target.z+3;assert.equal(f.command({type:'board',target:target.id,crewIds:['brisk','fuse']},'stranger').ok,false);
 f.tick(12);assert.equal(f.ship.boarding,null);assert.equal(f.ship.stats.captures,1);assert.equal(f.ship.gold,start+200);assert.ok(f.ship.crew.every(c=>!c.away));f.tick(20);assert.equal(f.ship.gold,start+200);
});
test('shared expeditions build bonds and stories; praise builds captain trust',()=>{
 const f=voyage();f.ship.x=12;f.ship.z=17;f.command({type:'away',job:'timber',crewIds:['peg','pip']});f.tick(23);
 const peg=f.ship.crew[3];assert.equal(peg.bonds.pip,55);assert.ok(peg.stories.some(s=>s.includes('Mossjaw')));const trust=peg.trust;
 assert.equal(f.command({type:'praise',crewId:'peg'}).ok,true);assert.equal(f.ship.crew[3].trust,trust+2);assert.equal(f.command({type:'praise',crewId:'peg'}).ok,false);
 const loaded=voyage(f.snapshot());assert.equal(loaded.ship.crew[3].bonds.pip,55);
});
test('long mixed voyages keep resources finite, bounded and private',()=>{
 const f=voyage(),commands=[{type:'trade',item:'buy',good:'medicine'},{type:'trade',item:'sell',good:'spice'},{type:'service',service:'repairs'},{type:'service',service:'doctor'},{type:'standing',rule:'repairAt',value:90},{type:'upgrade',fitting:'sails'},{type:'praise',crewId:'peg'},{type:'mission',id:'daily'},{type:'abandon'},{type:'habit',crewId:'pip',action:'discourage'},{type:'order',crewId:'peg',task:'repair',issuer:'morrow'},{type:'fire',target:'redwake',ammunition:'chain'}];
 for(let tick=0;tick<1800;tick++){
  if(tick%120===0)f.port(tick%240===0?'saltwick':'gallows');
  if(tick%7===0)f.command(commands[Math.floor(tick/7)%commands.length]);
  f.tick();
  for(const s of Object.values(f.world.ships)){
   for(const key of ['hull','maxHull','food','gold','timber','ammo','reputation'])assert.ok(Number.isFinite(s[key])&&s[key]>=0,key);
   assert.ok(s.hull<=s.maxHull);assert.ok(s.log.length<=35);
   assert.ok(s.cargo+s.goods.cloth+s.goods.medicine<=50+s.upgrades.hold*15);
   for(const c of s.crew){assert.ok(c.fatigue>=0&&c.fatigue<=100);assert.ok(c.injury>=0&&c.injury<=100);assert.ok(c.trust>=0&&c.trust<=100);assert.ok(c.memories.length<=10);assert.ok(c.stories.length<=5);}
  }
 }
 const loaded=voyage(f.snapshot());assert.ok(JSON.stringify(loaded.world).length<1024*1024);
});
test('scarcity changes cannot create same-port buy/sell arbitrage',()=>{
 const f=voyage();f.world.time=241;
 for(const p of ['saltwick','gallows','brasshaven','winterwake'])for(const good of ['spice','cloth','medicine']){
  const buys=[],sells=[];
  for(let stock=0;stock<=100;stock+=5){f.world.markets[p][good]=stock;const view=f.command({type:'sync'}).broadcast[0].data;const price=view.prices.find(x=>x.id===p).goods[good];buys.push(price.buy);sells.push(price.sell);}
  assert.ok(Math.max(...sells)<Math.min(...buys),p+' '+good);
 }
});
test('sinking recalls away crew and clears damage and stale helm input',()=>{
 const f=voyage();const victim=f.world.ships.stranger;victim.x=f.ship.x+2;victim.z=f.ship.z;victim.hull=1;victim.fire=30;victim.leak=20;victim.rigDamage=40;victim.controlMode='manual';victim.steerThrottle=1;victim.steerUntil=100;
 victim.away={crewIds:['peg','pip'],returnAt:100,job:'timber',place:'mossjaw'};victim.crew[3].away=true;victim.crew[5].away=true;
 assert.equal(f.command({type:'fire',target:'stranger'}).ok,true);const recovered=f.world.ships.stranger;assert.equal(recovered.away,null);assert.equal(recovered.fire,0);assert.equal(recovered.leak,0);assert.equal(recovered.rigDamage,0);assert.equal(recovered.steerThrottle,0);assert.ok(recovered.crew.every(c=>!c.away));
});
test('anchored ports protect trading captains from raiders and player fire',()=>{
 const f=voyage();f.port();const enemy=f.world.raiders[0];enemy.x=f.ship.x+2;enemy.z=f.ship.z;enemy.homeX=enemy.x;enemy.homeZ=enemy.z;enemy.lastShot=-999;
 const hull=f.ship.hull;f.tick(20);assert.equal(f.ship.hull,hull);assert.equal(f.command({type:'fire',target:'redwake'}).ok,false);
 const other=f.world.ships.stranger;other.x=f.ship.x+2;other.z=f.ship.z;other.anchored=false;assert.equal(f.command({type:'fire',target:'captain'},'stranger').ok,false);
});
test('recent player fire warrants emergency duties while peaceful neighbours do not',()=>{
 const f=voyage(),other=f.world.ships.stranger;f.ship.x=-8;f.ship.z=0;other.x=-6;other.z=0;
 assert.equal(f.command({type:'order',crewId:'tallow',task:'guns',issuer:'brisk',override:true}).ok,false);
 assert.equal(f.command({type:'fire',target:'captain'},'stranger').ok,true);
 assert.equal(f.command({type:'order',crewId:'tallow',task:'guns',issuer:'brisk',override:true}).ok,true);
 assert.equal(f.command({type:'sync'}).broadcast[0].data.myShip.emergency,true);
});
