import { frame, onStart, onRender, onUpdate, onQuit, files } from 'starhermit:engine';
import { scene, renderer, Color, AmbientLight, DirectionalLight, PerspectiveCamera, Mesh, Group, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, PlaneGeometry, MeshStandardMaterial, BufferGeometry, Float32BufferAttribute, Vector3, DoubleSide, Fog } from 'starhermit:scene';
import { onAction, onWheel, onPointerButton } from 'starhermit:input';
import { authority } from 'starhermit:script';
import { storage } from 'starhermit:storage';
import * as platform from 'starhermit:platform';
import * as ui from 'starhermit:ui';
import * as draw from 'starhermit:draw';

// The renderer, input, UI, storage, practice authority and online sockets are
// all the real StarHermit host API. No browser-only replacement renderer.
const C={ink:'#0f1a20',panel:'#20160f',cream:'#f3e6c6',gold:'#e4b660',muted:'#b9a888',edge:'#6e5230',red:'#e3836b',green:'#a9d39b',brass:'#c8963e',teak:'#2a1c12',parchment:'#ead9b1',tar:'#120c08'};
const taskNames:any={helm:'Helm',lookout:'Lookout',guns:'Guns',repair:'Repair',cook:'Galley',forage:'Forage',rest:'Rest'};
const dirs=['prosper','explore','hunt','survive'];
const dirNames=['Make our fortune','See what’s out there','Hunt the bastards','Keep everyone alive'];
let activeSession='',state:any=null,channel:any=null,online=false,network='Local practice · saved on device',me='captain-local';
let selectedPlace='mossjaw',selectedCrew='peg',selectedEnemy='redwake',panel='',tab='voyage',zoom=0,targetZoom=0,deck=0;
let notice='',noticeTime=0,elapsed=0,saveClock=0,orderText='',issuer=0,override=false,job=0,party=['peg','pip'];
let room:any=null,roomSocket:any=null,roomsList:any[]=[],sessionList:any[]=[],joinCode='',delegate='',endpoint='http://127.0.0.1:8080/v1',model='smollm2-135m',apiKeyEnv='',brainMode=0;
let brainConfigs:any=storage.getJson('crew-brains')||{};
let labelHits:any[]=[],mobilePanel=false,dialogWidth=530;
const camera=new PerspectiveCamera(45,16/9,.1,250);
renderer.camera=camera;scene.background=new Color('#92bbb3');scene.fog=new Fog('#92bbb3',85,165);
const sun=new DirectionalLight('#ffe8bb',1.35);sun.position.set(-20,45,15);scene.add(sun,sun.target,new AmbientLight('#b3d7d2',.8));
const materials:any={};
function mat(color:string,rough=0.85){if(!materials[color])materials[color]=new MeshStandardMaterial({color,roughness:rough});return materials[color];}
function box(g:any,x:number,y:number,z:number,w:number,h:number,d:number,color:string){const m=new Mesh(new BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);g.add(m);return m;}
function sphere(g:any,x:number,y:number,z:number,r:number,color:string){const m=new Mesh(new SphereGeometry(r,10,7),mat(color));m.position.set(x,y,z);g.add(m);return m;}
function cylinder(g:any,x:number,y:number,z:number,rt:number,rb:number,h:number,color:string,n=8){const m=new Mesh(new CylinderGeometry(rt,rb,h,n),mat(color));m.position.set(x,y,z);g.add(m);return m;}
const sea=new Mesh(new PlaneGeometry(240,240),mat('#397c7c',.3));sea.rotation.x=-Math.PI/2;sea.position.y=-.7;scene.add(sea);
const waves:any[]=[];
for(let i=0;i<105;i++){const w=box(scene,Math.sin(i*132.7)*58,-.64,Math.cos(i*67.3)*55,.9+(i%4)*.45,.025,.10,i%3===0?'#68a49a':'#4b8c87');w.rotation.y=-.35;waves.push(w);}
const places:any[]=[
 {id:'saltwick',name:'Saltwick',kind:'port',x:-22,z:8,tag:'A respectable den of thieves'},
 {id:'mossjaw',name:'Mossjaw Cay',kind:'island',x:12,z:17,tag:'Timber, treasure & terrible mosquitoes'},
 {id:'gallows',name:'Gallows Reach',kind:'port',x:25,z:-19,tag:'Rum dear. Manners optional.'},
 {id:'rattle',name:'Rattlebone Isle',kind:'island',x:-22,z:-23,tag:'Dead men tell excellent directions'},
 {id:'wreck',name:'The Crooked Wreck',kind:'wreck',x:32,z:23,tag:'Salvage for the morally flexible'}
];
function tree(g:any,x:number,z:number,scale=1){cylinder(g,x,1.8*scale,z,.14*scale,.22*scale,2.1*scale,'#816646',5);for(let j=0;j<3;j++){const m=new Mesh(new ConeGeometry((1.5-j*.32)*scale,2.1*scale,7),mat(j===1?'#527e61':'#42694f'));m.position.set(x,(2.2+j*.8)*scale,z);g.add(m);}}
function house(g:any,x:number,z:number,col:string){box(g,x,1.7,z,1.9,2.0,1.8,'#e5d1a9');const roof=new Mesh(new ConeGeometry(1.75,1.2,4),mat(col));roof.rotation.y=Math.PI/4;roof.position.set(x,3.1,z);g.add(roof);box(g,x,1.8,z+.92,.48,.6,.05,'#705741');box(g,x+.55,2,z+.93,.3,.4,.05,'#e7bc6e');}
for(let i=0;i<places.length;i++){
 const p=places[i],g=new Group();g.position.set(p.x,0,p.z);scene.add(g);
 if(p.kind==='wreck'){box(g,0,-.05,0,3,1.0,7,'#5e4b3c').rotation.z=.28;box(g,.3,2,0,.18,4,.18,'#8b7252').rotation.z=.3;for(let j=0;j<5;j++)box(g,Math.sin(j)*2,-.2,Math.cos(j)*3,1,.3,.7,'#b39a72');continue;}
 cylinder(g,0,-.15,0,5.0,5.6,.8,'#b8b98e',12);cylinder(g,0,.25,0,4.5,5.0,.65,'#dabf88',12);cylinder(g,.3,.65,-.2,3.9,4.4,.6,i===3?'#7d937b':'#86a27b',11);
 if(p.kind==='port'){
  house(g,-1,0,'#a85c51');house(g,1.7,-1,'#79736b');house(g,-1.8,-2.1,'#9a6951');
  cylinder(g,2,3,-2.5,.6,.8,4.4,'#efe4c9',8);cylinder(g,2,5.3,-2.5,.9,.7,.5,'#8d5848',8);sphere(g,2,5,-2.5,.35,'#f2cf82');
  box(g,0,.2,5.7,2,.3,4.7,'#8d7354');for(let q=0;q<7;q++)box(g,0,.4,4+q*.55,2,.08,.08,'#b5996c');
  for(let q=0;q<2;q++)cylinder(g,q?1:-1,.7,7,.12,.12,1.2,'#72583f');tree(g,-3,1,.65);
 }else{for(let j=0;j<7;j++)tree(g,Math.sin(j*8.3)*2.6,Math.cos(j*3.4)*2.5,.65+(j%3)*.15);cylinder(g,-1,1.1,1,.9,1.2,1.2,'#8a9480',6);if(i===3){sphere(g,1,1,2,.7,'#ddd9bb');sphere(g,.75,1.12,2.58,.16,'#4a514a');sphere(g,1.25,1.12,2.58,.16,'#4a514a');}else{box(g,1,1.0,2,1.2,.65,.8,'#91663f');box(g,1,1.1,2.42,.15,.4,.05,'#dfbd61');}}
}
const ships:any={};
let longboat:any=null;
function makeLongboat(){const g=new Group();box(g,0,0,0,.9,.3,2,'#916946');box(g,0,.19,0,.65,.08,1.6,'#c19c64');for(let i=0;i<2;i++){const doll=crewDoll(i?'#8aadaf':'#77a891',i+2);doll.scale.set(.65,.65,.65);doll.position.set(0,.22,i?-.45:.45);g.add(doll);}for(let i=0;i<2;i++)box(g,i?1:-1,.3,0,1.5,.06,.12,'#ddc38c');scene.add(g);return g;}
function crewDoll(color:string,index:number){const g=new Group();cylinder(g,0,.35,0,.17,.22,.45,color,7);sphere(g,0,.75,0,.23,'#efd0a4');const hat=sphere(g,0,.9,-.02,.24,color);hat.scale.y=.5;box(g,0,.84,.1,.48,.06,.35,color);sphere(g,-.085,.78,.20,.035,'#222f30');sphere(g,.085,.78,.20,.035,'#222f30');box(g,0,.22,.02,.1,.14,.12,'#514d43');if(index===0){box(g,0,1.0,0,.66,.12,.23,'#353f3b');box(g,0,1.08,0,.35,.19,.15,'#353f3b');}return g;}
function buildShip(id:string,enemy=false){
 const g=new Group(),hull=new Group(),rig=new Group(),lower=new Group();g.add(hull,rig,lower);scene.add(g);
 // A faceted boat hull with a pointed bow, authored as geometry for the engine.
 const v:number[]=[],indices:number[]=[];
 const sections=[[-3.8,.85],[-2.7,1.65],[1.8,1.55],[4.2,.04]];
 for(let i=0;i<sections.length;i++){const z=sections[i][0],w=sections[i][1];v.push(-w,1.15,z,w,1.15,z,-w*.68,-.3,z,w*.68,-.3,z);}
 for(let i=0;i<3;i++){let a=i*4,b=a+4;indices.push(a,b,a+2,a+2,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1,a+2,b+2,a+3,a+3,b+2,b+3,a,b+1,b,a,a+1,b+1);}
 indices.push(0,2,1,1,2,3,12,13,14,14,13,15);
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(v,3));geometry.setIndex(indices);geometry.computeVertexNormals();hull.add(new Mesh(geometry,mat(enemy?'#604640':'#775438')));
 box(hull,0,1.19,-.3,2.9,.16,6.7,'#bb9460');
 for(let j=0;j<18;j++)box(hull,0,1.29,-3.4+j*.37,2.85,.025,.025,'#8e714d');
 for(let j=0;j<2;j++){const x=j?1.5:-1.5;box(hull,x,1.65,-.5,.09,.13,5.8,'#dfbd7e');for(let q=0;q<6;q++)box(hull,x,1.45,-3+q*1.0,.08,.5,.08,'#96734a');}
 box(hull,0,1.8,-2.6,2.7,1.15,1.9,enemy?'#8d4a44':'#627774');box(hull,0,2.43,-2.7,3.0,.16,2.1,'#6d5142');
 for(let j=0;j<3;j++)box(hull,-.9+j*.9,1.85,-3.57,.4,.42,.035,'#eccb7c');
 for(let j=0;j<3;j++)for(let side=0;side<2;side++){const cannon=cylinder(hull,side?1.55:-1.55,1.44,-1.5+j*1.5,.14,.17,.8,'#414e4b',8);cannon.rotation.z=Math.PI/2;box(hull,side?1.3:-1.3,1.3,-1.5+j*1.5,.45,.12,.48,'#584a39');}
 box(hull,0,1.7,3.5,.12,.1,3.0,'#7e6446');
 for(let j=0;j<2;j++){
  const z=j?-1.9:1.0;box(rig,0,3.7,z,.16,5.7,.16,'#8d714b');box(rig,0,5.25,z,4.1,.12,.12,'#9b7e52');
  const sail=new Mesh(new PlaneGeometry(j?2.9:4.1,j?2.3:2.8,4,3),new MeshStandardMaterial({color:enemy?'#bb6b57':'#f1e5bc',side:DoubleSide,roughness:1}));sail.position.set(0,3.9,z+.13);sail.rotation.y=-.16;rig.add(sail);
  if(!j){sphere(rig,-.3,4.3,z+.19,.16,'#655b4d');sphere(rig,.3,4.3,z+.19,.16,'#655b4d');box(rig,0,3.7,z+.2,.63,.14,.03,'#655b4d');}
 }
 const flag=new Mesh(new PlaneGeometry(1.2,.65),new MeshStandardMaterial({color:'#33443e',side:DoubleSide}));flag.position.set(.6,6.4,1);rig.add(flag);sphere(rig,.6,6.42,1.02,.17,'#efe0b7');
 // Gun and hold floors for the management cutaway.
 box(lower,0,-.2,0,3.2,.16,7.1,'#9b7954');box(lower,0,-1.6,0,3.2,.16,7.1,'#80664c');
 for(let j=0;j<4;j++){box(lower,-1.1,-1.15,-2+j*1.2,.7,.75,.8,'#b68b54');box(lower,1.0,-.0,-2+j*1.2,.7,.45,.7,'#5d6961');}
 lower.visible=false;
 const dolls:any[]=[];for(let i=0;i<6;i++){const c=crewDoll(['#b25952','#dda854','#7d88a2','#77a891','#c57c9b','#8aadaf'][i],i);hull.add(c);dolls.push(c);}
 const o={g,hull,rig,lower,dolls,enemy};ships[id]=o;return o;
}
const taskPos:any={helm:[0,-2.4],lookout:[.8,2.3],guns:[-1.0,0],repair:[.9,-.7],cook:[-.7,-1.7],forage:[.8,1.3],rest:[-.7,-2.4]};
function flash(text:string){notice=text;noticeTime=7;}
function command(c:any){if(!channel||!channel.sendCommand(c))flash('The channel is busy. Try again in a moment.');}
function got(data:any){if(!data)return;if(data.type==='snapshot'&&!online){lastSnapshot=data.world;storage.setJson('practice-world',lastSnapshot);return;}if(data.type!=='state')return;const oldDelegate=state?.myShip?.delegate;if(!state&&data.myShip)console.info('Authoritative ship ready: '+data.myShip.crew.length+' crew.');state=data;if(state.myShip&&oldDelegate!==state.myShip.delegate)delegate=state.myShip.delegate||'';}
function watch(c:any){c.on('game',got);c.on('error',(e:any)=>flash(String(e)));c.on('open',()=>c.sendCommand({type:'sync'}));c.on('stopped',(e:any)=>{network='Disconnected · '+e;flash('Connection ended: '+e+'. Open World to reconnect.');});}
function local(){if(channel)channel.close();online=false;me='captain-local';const saved:any=storage.getJson('practice-world');channel=authority('server.js',{context:{sessionId:'brine-local',players:[{id:me,name:'Captain'}],sessionState:saved||null},rate:1});watch(channel);network='Local practice · saved on device';}
function connect(id:string){activeSession=id;if(channel)channel.close();me=platform.player()?.userId||'';online=true;channel=platform.connectGame(id);watch(channel);network='StarHermit · connecting';channel.on('open',()=>{network='StarHermit · persistent world';});channel.on('disconnected',()=>{network='Reconnecting to StarHermit…';});}
async function listWorlds(){try{sessionList=await platform.sessions.list();roomsList=await platform.rooms.browse({inProgress:true});}catch(e){flash(String(e));}}
async function makeWorld(){try{room=await platform.rooms.create({name:'The Quarrelsome Sea',teamCount:1,seatsPerTeam:8,isVisible:true,joinInProgress:true,backfillAiPlayers:0});room=await platform.rooms.open(room.id);roomSocket=platform.rooms.connect(room.id);roomSocket.on('roster',(r:any)=>{room=r;if(r.gameSessionId&&!online)connect(r.gameSessionId);});room=await platform.rooms.start(room.id);if(room.gameSessionId)connect(room.gameSessionId);}catch(e){flash(String(e));}}
async function joinWorld(){try{room=await platform.rooms.joinByCode(joinCode.trim());roomSocket=platform.rooms.connect(room.id);roomSocket.on('roster',(r:any)=>{room=r;if(r.gameSessionId&&!online)connect(r.gameSessionId);});if(room.gameSessionId)connect(room.gameSessionId);else flash('Joined. Waiting for the host to start this sea.');}catch(e){flash(String(e));}}
function updateBrainFields(){const c=brainConfigs[selectedCrew]||{};endpoint=c.base_url||'http://127.0.0.1:8080/v1';model=c.model||'smollm2-135m';apiKeyEnv=c.api_key_env||'';brainMode=c.mode==='endpoint'?1:0;}
function saveBrain(){brainConfigs[selectedCrew]={mode:brainMode?'endpoint':'tiny',base_url:endpoint,model,api_key_env:apiKeyEnv};storage.setJson('crew-brains',brainConfigs);flash('Character brain saved on this device. Export it for the local brain officer.');}
function exportBrains(){saveBrain();files.saveAs('crew-brains.json',JSON.stringify({schema:1,default:{mode:'tiny',base_url:'http://127.0.0.1:8080/v1',model:'smollm2-135m'},crew:brainConfigs},null,2),{type:'application/json'}).catch(e=>flash(String(e)));}
function meter(name:string,v:number,max:number,color:string,width=215){ui.row(name,()=>{ui.label(name,{color:C.muted,size:11});ui.spacer();ui.label(Math.round(v)+' / '+max,{size:11,color});},{width});ui.style({parts:{fill:{background:color},track:{background:'#3a2716'}},height:5}).progress(v/max,width);}
function button(label:string,fn:()=>void,selected=false,disabled=false){if(ui.style(selected?'gold':'soft').button(label,{selected,disabled}))fn();}
function route(id:string){selectedPlace=id;command({type:'sail',destination:id});}
function openCrew(id:string){selectedCrew=id;panel='crew';updateBrainFields();}
function doOrder(task:string){command({type:'order',crewId:selectedCrew,task,issuer:issuer?'brisk':'morrow',override,note:orderText});}
function parseOrder(){
 const text=orderText.toLowerCase(),crew=state?.myShip?.crew||[];
 const match=crew.find((c:any)=>text.includes(c.name.split(' ')[0].toLowerCase())||text.includes(c.id));if(match)selectedCrew=match.id;
 let task='';for(const t of ['repair','guns','lookout','helm','cook','forage','rest'])if(text.includes(t))task=t;
 if(/patch|fix|hull/.test(text))task='repair';if(/fire|cannon|shoot/.test(text))task='guns';if(/sleep|nap/.test(text))task='rest';if(/sail|steer/.test(text))task='helm';if(/food|soup/.test(text))task='cook';
 if(!task){flash('Try “Peg, repair the hull”, “Fuse, guns” or “Pip, lookout”.');return;}doOrder(task);orderText='';
}
onStart(()=>{
 ui.setTheme({fontSize:13,headingSize:20,smallSize:11,padding:12,spacing:8,text:C.cream,muted:C.muted,panel:C.panel,control:'#3a2716',hovered:'#4d3420',pressed:'#2a1c12',field:'#170f0a',accent:C.gold,focus:C.gold,outline:C.edge,radius:4});
 // Naval theme: oiled teak planking for bars and rails, brass fittings for buttons, sea-chart parchment for cards.
 const wood=(shade:string)=>[{type:'linear',angle:180,stops:[shade,shade]},{image:'assets/wood.png',repeat:true,size:[256,256]}] as const;
 const brassEdge={width:1,color:'#a77a33'},brassBevel=[{x:0,y:1,color:'#f7d79066',inset:true},{x:0,y:-2,color:'#00000055',inset:true}];
 ui.setStyles({
  '.woodbar':{background:wood('#1a110b8c'),border:{width:{bottom:2},color:{bottom:C.brass}},shadow:{x:0,y:3,blur:8,color:'#00000066'}},
  '.woodstrip':{background:wood('#0f0a06b8'),border:{width:{bottom:1},color:{bottom:'#7a5a2e'}}},
  '.deckbar':{background:wood('#120c08a6'),border:{width:{top:2},color:{top:C.brass}},shadow:{x:0,y:-3,blur:8,color:'#00000066'}},
  panel:{background:wood('#1d130ca0'),border:{width:2,color:'#8e6a32',style:'double'},radius:3,shadow:[{x:0,y:4,blur:14,color:'#000000aa'},{x:0,y:0,blur:0,spread:1,color:'#00000088'}]},
  button:{padding:{top:9,bottom:9,start:12,end:12},radius:3,text:{size:12,color:C.cream},border:brassEdge,background:{type:'linear',angle:180,stops:['#4a3220','#2f1f13']},shadow:brassBevel,
   hovered:{background:{type:'linear',angle:180,stops:['#5c3f28','#3a2616']},border:{color:C.gold}},pressed:{background:'#24170e'},transition:0.12},
  '.gold':{background:{type:'linear',angle:180,stops:['#f6d58c','#d9a64c','#b5822f']},text:{color:C.tar,weight:'bold'},border:{color:'#7c5520',width:1},shadow:[{x:0,y:1,color:'#fff3c899',inset:true},{x:0,y:2,blur:4,color:'#00000066'}],
   hovered:{background:{type:'linear',angle:180,stops:['#fbe3a6','#e6b65c','#c18d36']}},selected:{background:{type:'linear',angle:180,stops:['#f6d58c','#d9a64c','#b5822f']},text:{color:C.tar}}},
  '.soft':{background:{type:'linear',angle:180,stops:['#3e2a1a','#2a1c12']},border:{color:'#6e5230',width:1},selected:{background:{type:'linear',angle:180,stops:['#5a3d22','#3d2916']},border:{color:C.gold},text:{color:C.gold}}},
  '.flat':{background:'transparent',border:{width:{top:0,start:0,end:0,bottom:1},color:{bottom:'#8e6a3266'}},radius:0,shadow:[],text:{color:C.muted,size:12},hovered:{background:'#3a271633',text:{color:C.gold}}},
  '.card':{background:[{type:'linear',angle:180,stops:['#ead9b1a0','#dcc596b0']},{image:'assets/parchment.png',size:'cover'}],border:{width:1,color:'#8a6a3a'},padding:12,radius:2,shadow:{x:0,y:2,blur:6,color:'#00000088'},
   inside:{label:{text:{color:'#2b1c10'}},paragraph:{text:{color:'#3b2a1a'}}}},
  dialog:{background:wood('#1c130cc8'),border:{width:3,color:'#9b7436',style:'double'},radius:4,width:620,padding:22,shadow:{x:0,y:10,blur:30,color:'#000000cc'},parts:{backdrop:{background:'#05090dc4'}}},
  textField:{width:250,padding:10,border:{width:1,color:'#8e6a32'},radius:2,background:'#140d08',text:{color:C.cream}},select:{width:235,border:{width:1,color:'#8e6a32'},radius:3,background:{type:'linear',angle:180,stops:['#4a3220','#2f1f13']}},
  heading:{text:{font:'serif',weight:'bold',color:'#f6e7c4'}},
  '.toast':{background:[{type:'linear',angle:180,stops:['#ead9b1c0','#d6bd8cd0']},{image:'assets/parchment.png',size:'cover'}],border:{width:2,color:'#8a6a3a'},radius:2,shadow:{x:0,y:4,blur:12,color:'#000000aa'}},
  '.tag':{background:'#1a110bdd',border:{width:1,color:'#8e6a3288'},radius:2},
 });
 local();const launched=platform.launchContext();if(launched?.sessionId)connect(launched.sessionId);
});
onAction(e=>{if(!e.pressed||ui.capturingKeys())return;if(e.action==='zoomin')targetZoom=1;if(e.action==='zoomout'||e.action==='map')targetZoom=0;if(e.action==='anchor')command({type:'anchor'});if(e.action==='fire')command({type:'fire',target:selectedEnemy});if(e.action==='crew')openCrew(selectedCrew);});
onWheel((_,dy)=>{if(!ui.pointerOver())targetZoom=Math.max(0,Math.min(1,targetZoom-dy*.15));});
onPointerButton(e=>{if(e.pressed||e.button!==0||ui.pointerOver())return;for(const l of labelHits)if(e.x>=l.x&&e.x<=l.x+l.w&&e.y>=l.y&&e.y<=l.y+l.h){if(l.crew)openCrew(l.id);else selectedPlace=l.id;return;}});
onUpdate(dt=>{elapsed+=dt;noticeTime=Math.max(0,noticeTime-dt);zoom+=(targetZoom-zoom)*Math.min(1,dt*5);saveClock+=dt;if(saveClock>10&&state&&!online){saveClock=0;command({type:'snapshot'});}});
onQuit(()=>{if(state&&!online&&lastSnapshot)storage.setJson('practice-world',lastSnapshot);});
let lastSnapshot:any=null;
// The practice snapshot is reconstructed only from the authority's explicit
// private export; online session state never comes from device storage.
function labelAt(text:string,x:number,y:number,z:number,color:string,id?:string,crew=false){
 const f=frame(),v=new Vector3(x,y,z).project(camera),px=(v.x+1)*f.width/2,py=(1-v.y)*f.height/2;
 if(px<20||px>f.width-20||py<100||py>f.height-180)return;
 const width=draw.measureText(text,{size:12*f.scale}).width;
 draw.box(px-width/2-9*f.scale,py-6*f.scale,width+18*f.scale,27*f.scale,'tag');
 draw.text(text,px,py,{size:12*f.scale,color,align:'center'});
 if(id){const hit={x:px-width/2-9*f.scale,y:py-6*f.scale,w:width+18*f.scale,h:27*f.scale,id,crew};labelHits.push(hit);ui.target(text,{x:hit.x,y:hit.y,width:hit.w,height:hit.h});}
}
function renderScene(){
 const f=frame(),s=state?.myShip;camera.aspect=f.width/Math.max(1,f.height);camera.updateProjectionMatrix();
 const focusX=s?s.x:0,focusZ=s?s.z:0;
 const cx=focusX*zoom,cz=focusZ*zoom;
 const dist=1-zoom;
 camera.position.set(cx+24*dist+10*zoom,43*dist+13*zoom,cz+37*dist+13*zoom);camera.lookAt(cx,zoom*1.6,cz);camera.updateMatrixWorld();
 for(let i=0;i<waves.length;i++){const w=waves[i];w.position.y=-.63+Math.sin(elapsed*1.8+i)*.025;w.scale.x=1+Math.sin(elapsed+i)*.12;}
 if(!state)return;
 const all=state.ships.concat(state.raiders);const visible:any={};
 for(const ss of all){visible[ss.id]=true;let obj=ships[ss.id];if(!obj)obj=buildShip(ss.id,!!ss.npc);obj.g.visible=ss.hull>0;if(!obj.g.visible)continue;const mine=ss.id===me;obj.g.position.set(ss.x,Math.sin(elapsed*1.3+ss.x)*.06,ss.z);obj.g.rotation.y=ss.heading||0;obj.g.rotation.z=Math.sin(elapsed+ss.x)*.012;
  obj.rig.visible=!(mine&&zoom>.6);obj.hull.visible=!(mine&&zoom>.6&&deck>0);obj.lower.visible=mine&&zoom>.6&&deck>0;
  if(mine&&zoom>.6&&deck>0)obj.lower.position.y=deck===1?1.2:2.6;
  for(let i=0;i<obj.dolls.length;i++){const d=obj.dolls[i],c=mine?s.crew[i]:null;d.visible=!c||!c.away;if(c){const p=taskPos[c.task]||[0,0];d.position.set(p[0]+Math.sin(elapsed*.5+i)*.07,1.34,p[1]+(i%2)*.25);d.rotation.y=Math.sin(elapsed*.8+i)*.18;}}
  if(mine&&zoom>.65&&deck>0){for(const d of obj.dolls)d.visible=false;}
 }
 for(const id of Object.keys(ships))if(!visible[id])ships[id].g.visible=false;
 if(s?.away){if(!longboat)longboat=makeLongboat();longboat.visible=true;const p=places.find(p=>p.id===s.away.place)!;const t=Math.max(0,Math.min(1,(state.time-s.away.departAt)/22)),move=t<.3?t/.3:t>.7?(1-t)/.3:1;longboat.position.set(s.x+(p.x-s.x)*move,-.1,s.z+(p.z-s.z)*move);longboat.rotation.y=Math.atan2(p.x-s.x,p.z-s.z)+(t>.7?Math.PI:0);}
 else if(longboat)longboat.visible=false;
 labelHits=[];
 if(zoom<.65){for(const p of places)labelAt((p.kind==='port'?'⚓ ':'')+p.name,p.x,6.5,p.z,selectedPlace===p.id?C.gold:C.cream,p.id);for(const ss of state.raiders)if(ss.hull>0)labelAt(ss.name,ss.x,7.8,ss.z,C.red);}
 else if(s){labelAt(s.name,s.x,6,s.z,C.gold);const l=s.log[s.log.length-1];if(l&&state.time-l.at<8)labelAt(l.name+': '+(l.text.length>54?l.text.slice(0,l.text.lastIndexOf(' ',53)>20?l.text.lastIndexOf(' ',53):53)+'…':l.text),s.x,4.5,s.z+2,C.cream);}
}
function header(w:number,scale:number,mobile:boolean){
 draw.box(0,0,w,76*scale,'woodbar');
 ui.area({x:20*scale,y:10*scale,width:w-40*scale,height:58*scale},()=>ui.row('Header',()=>{
  ui.column('Brand',()=>{ui.heading('Pirate Intelligence',{font:'serif',size:mobile?23:28});ui.label(mobile?'A FINE CREW. A TERRIBLE IDEA.':'A SMALL SHIP. AN UNREASONABLE AMOUNT OF TROUBLE.',{color:C.muted,size:9});},{spacing:1});
  ui.spacer();if(!mobile&&state){for(const [name,val] of [['GOLD',Math.floor(state.myShip?.gold||0)],['TIMBER',Math.floor(state.myShip?.timber||0)],['SHOT',state.myShip?.ammo||0]])ui.column(name as string,()=>{ui.label(name as string,{size:9,color:C.muted});ui.label(String(val),{size:21,color:C.gold,weight:'bold'});},{width:80,spacing:2});}
  button(mobile?'World':'⚓  World & crew',()=>{panel='world';if(platform.player())listWorlds();});
 },{width:(w-40*scale)/scale,align:'center',spacing:16}));
}
function toolbar(w:number,scale:number,mobile:boolean){
 draw.box(0,76*scale,w,50*scale,'woodstrip');
 ui.area({x:20*scale,y:84*scale,width:w-40*scale,height:40*scale},()=>ui.row('Views',()=>{
  button('Sea chart',()=>{targetZoom=0;},targetZoom<.5);button('Aboard ship',()=>{targetZoom=1;},targetZoom>=.5);
  if(!mobile){ui.label('Q / E or scroll to zoom',{size:11,color:C.muted});ui.spacer();ui.label('DAY '+(state?.day||1)+'   ·   '+(state?.weather||'Fair winds'),{size:11,color:C.muted});}
  else{ui.spacer();button('Orders',()=>{mobilePanel=!mobilePanel;});}
 },{width:(w-40*scale)/scale,align:'center',spacing:8}));
}
function navPanel(x:number,y:number,width:number,height:number,scale:number){
 const s=state?.myShip;if(!s)return;
 ui.area({x:x*scale,y:y*scale,width:width*scale,height:height*scale},()=>ui.scrollArea('Navigation rail',{width,height},()=>ui.panel('Navigation',()=>{
  ui.label('THE QUARRELSOME SEA',{color:C.gold,size:10,weight:'bold'});ui.heading(zoom>.5?'Below the bravado':'Pick your next bad idea',{size:19});
  if(zoom>.5){ui.paragraph('One ship. Three decks. Six entirely individual opinions.',width-28,{size:12});for(let i=0;i<3;i++)button(['01  Weather deck','02  Gun deck','03  Cargo hold'][i],()=>{deck=i;},deck===i);ui.label(['Helm · rigging · lookout','Six guns · powder · patching','Spices · provisions · questionable cargo'][deck],{color:C.muted,size:10});if(deck===2){ui.label('Spice cargo: '+s.cargo+' / 50');ui.label('Provisions: '+Math.round(s.food));ui.label('Timber: '+Math.floor(s.timber));}ui.style('gold').button(s.anchored?'⚓  At anchor':'Under way',{disabled:true});}
  else{for(const p of places){if(ui.style(selectedPlace===p.id?'gold':'flat').button(p.name,{content:()=>{ui.label(p.name,{weight:'bold',size:13});ui.label(p.kind==='port'?'PORT & TRADING':p.kind==='wreck'?'SALVAGE':'ISLAND & AWAY MISSIONS',{size:9});}}))selectedPlace=p.id;}
   const p=places.find(p=>p.id===selectedPlace)!;ui.paragraph(p.tag,width-28,{size:11});button('Set course  →',()=>route(p.id),true);}
  ui.label('SHIP STATUS',{size:10,color:C.gold,weight:'bold'});meter('Hull',s.hull,s.maxHull,s.hull<40?C.red:C.green,width-28);meter('Crew spirit',s.morale,100,C.gold,width-28);
  ui.label('LV '+s.level+'   '+Math.floor(s.xp)+' / '+(s.level*100)+' XP',{color:C.muted,size:10});
  button('Contracts & rumours',()=>{panel='missions';});
 },{width,padding:14,spacing:10})));
}
function ordersPanel(x:number,y:number,width:number,height:number,scale:number){
 const s=state?.myShip;if(!s)return;
 ui.area({x:x*scale,y:y*scale,width:width*scale,height:height*scale},()=>ui.scrollArea('Captain’s desk rail',{width,height},()=>ui.panel('Captain’s desk',()=>{
  ui.label('CAPTAIN’S DESK',{color:C.gold,size:10,weight:'bold'});ui.heading('What’s the plan?',{size:22});
  let d=ui.select('Standing directive',Math.max(0,dirs.indexOf(s.directive)),dirNames);if(d!==dirs.indexOf(s.directive))command({type:'directive',value:dirs[d]});
  ui.paragraph('Your crew chooses how to get there. Direct orders teach them your habits.',width-28,{size:11});
  ui.row('Crew header',()=>{ui.label('SIX SOULS, ONE CHAIN OF COMMAND',{color:C.gold,size:9});},{width:width-28});
  for(const c of s.crew){if(ui.id('crew-'+c.id).style('flat').button(c.name,{content:()=>{ui.row('summary-'+c.id,()=>{ui.label('●',{color:c.color,size:18});ui.column('name-'+c.id,()=>{ui.label(c.name,{size:12,weight:'bold'});ui.label(c.role+' · Lv '+c.level,{size:9,color:C.muted});},{spacing:0});ui.spacer();ui.label(c.away?'AWAY':taskNames[c.task],{size:10,color:c.away?C.gold:C.green});},{width:width-46,spacing:8,align:'center'});}}))openCrew(c.id);}
  ui.row('quick',()=>{button(s.anchored?'Anchor down':'Drop anchor',()=>command({type:'anchor'}));button('Longboat',()=>{panel='away';});},{spacing:6});
 },{width,padding:14,spacing:10})));
}
function bottom(w:number,h:number,scale:number,mobile:boolean){
 const s=state?.myShip;if(!s)return;
 const destination=places.find(p=>p.id===s.destination)||state.raiders.concat(state.ships).find((p:any)=>'ship:'+p.id===s.destination);
 const width=w/scale,height=h/scale,bh=mobile?156:167,y=height-bh;
 draw.box(0,y*scale,w,bh*scale,'deckbar');
 ui.area({x:20*scale,y:(y+13)*scale,width:(width-40)*scale,height:(bh-20)*scale},()=>ui.row('Bottom',()=>{
  ui.column('Ship talk',()=>{ui.label('OVERHEARD ABOARD',{size:9,color:C.gold,weight:'bold'});const logs=s.log.slice(-(mobile?2:3));for(const l of logs){ui.paragraph(l.name+': “'+l.text+'”',mobile?width-40:Math.min(480,width*.4),{size:11});}ui.label(network,{size:9,color:C.muted});},{width:mobile?width-40:Math.min(490,width*.41),spacing:7});
  if(!mobile){ui.column('Orders and battle',()=>{
   ui.row('command box',()=>{orderText=ui.textField('Direct command',orderText,{width:Math.max(150,width-885),placeholder:'Peg, repair the hull…',maxChars:160});button('Give order  ↵',parseOrder,true);},{spacing:8});
   ui.row('actions',()=>{button('Trade in port',()=>{panel='trade';});button('Fire broadside  [F]',()=>command({type:'fire',target:selectedEnemy}));button('Targets',()=>{panel='combat';});button('Shipyard',()=>{panel='yard';});},{spacing:8});
   ui.label(s.away?'Longboat returns in '+Math.max(0,Math.ceil(s.away.returnAt-state.time))+'s':s.destination?'Sailing to '+destination?.name+' · '+Math.round(distanceTo(s,destination))+' fathoms':s.mission?'CONTRACT: '+s.mission.title:'No contract. The sea is full of bad opportunities.',{size:10,color:C.muted});
  },{spacing:10});}
 },{spacing:24,width:width-40}));
}
function distanceTo(s:any,p:any){return p?Math.sqrt((s.x-p.x)**2+(s.z-p.z)**2):999;}
function crewDialog(s:any){
 const c=s.crew.find((c:any)=>c.id===selectedCrew)||s.crew[0];
 ui.grid('crew picker',()=>{for(let i=0;i<6;i++)button(s.crew[i].name.split(' ')[0],()=>{selectedCrew=s.crew[i].id;updateBrainFields();},c.id===s.crew[i].id);},{columns:dialogWidth<460?3:6,width:dialogWidth,gap:4});
 ui.heading(c.name,{size:24});ui.label(c.role,{color:C.gold});ui.paragraph(c.trait,dialogWidth,{size:13});
 ui.label('LEVEL '+c.level+'   ·   '+Math.floor(c.xp)+' / '+(c.level*35)+' XP   ·   FATIGUE '+Math.round(c.fatigue)+'%',{color:C.gold,size:11});
 ui.row('crew tabs',()=>{button('Orders & memory',()=>tab='voyage',tab==='voyage');button('Individual brain',()=>tab='brain',tab==='brain');});
 if(tab==='brain'){
  ui.paragraph('Each character has a separate model, endpoint, prompt and learned orders. The engine is sandboxed: a local brain officer connects through StarHermit’s API.',dialogWidth,{size:12});
  brainMode=ui.select('Decision provider',brainMode,['Tiny CPU default · SmolLM2 135M','My OpenAI-compatible endpoint']);
  endpoint=ui.textField('Endpoint base URL',endpoint,{width:dialogWidth,maxChars:240});model=ui.textField('Model ID',model,{width:dialogWidth,maxChars:100});apiKeyEnv=ui.textField('API key environment variable (optional)',apiKeyEnv,{width:dialogWidth,maxChars:60});
  ui.column('brain save',()=>{button('Save this character',saveBrain,true);button('Export brain configuration',exportBrains);button('Setup help',()=>panel='brains');});
  ui.label('DECISION JSON ONLY · NO MODEL-GENERATED DIALOGUE',{size:10,color:C.gold});
  ui.paragraph('Current source: '+(c.brain==='local LLM'?'validated local LLM decision':'built-in instinct (no LLM connected)')+'. Missing or invalid model replies fall back to crew instincts.',dialogWidth,{size:11});
 }else{
  issuer=ui.select('Order through',issuer,['Captain Mara Morrow','First mate Barnaby Brisk']);override=ui.checkbox('Emergency warrant for duties outside their role',override);
  ui.label('Ordinary duties: '+c.ordinary.map((t:string)=>taskNames[t]).join(' · '),{size:11,color:C.muted});
  ui.row('task choices',()=>{for(const t of ['helm','lookout','guns','repair'])button(taskNames[t],()=>doOrder(t),c.task===t);},{spacing:6});ui.row('task choices 2',()=>{for(const t of ['cook','forage','rest'])button(taskNames[t],()=>doOrder(t),c.task===t);button('Good work. Remember that.',()=>command({type:'praise',crewId:c.id}));},{spacing:6});
  ui.label('LEARNED FROM YOU',{color:C.gold,size:10,weight:'bold'});
  if(!c.memories.length)ui.paragraph('No orders remembered yet. Direct commands build bounded task preferences; praise reinforces the current choice.',dialogWidth,{size:12});else{for(const m of c.memories.slice(-3))ui.label('↳ '+m.text+'  ['+m.directive+']',{size:11});}
  const prefs=Object.keys(c.preferences).map(k=>taskNames[k]+' +'+c.preferences[k].toFixed(1));if(prefs.length)ui.label('Habits: '+prefs.join(' · '),{size:11,color:C.green});
  ui.paragraph('Captain → First mate → specialists. Officer warrants work only when low hull, hunger or a nearby hostile makes the situation urgent. A direct order lasts 35 seconds.',dialogWidth,{size:11});
 }
}
function worldDialog(){
 ui.paragraph('Local practice is playable now. Online worlds use the same server rules through StarHermit sessions, with one ship for every captain. Empty worlds pause under StarHermit’s recovery policy.',dialogWidth,{size:12});
 ui.label(online?'CONNECTED TO STARHERMIT':'PLAYING LOCAL PRACTICE',{color:C.gold,size:10});
 if(!platform.player()){
  ui.paragraph('This preview is running on the StarHermit 1.20.0 engine as a guest. Online play needs this package registered on StarHermit; this preview has no platform game identity.',dialogWidth,{size:12});
  button('StarHermit account',()=>{platform.requestSignIn().catch(e=>flash(String(e)));});
 }else{
  ui.label('Signed in: '+platform.player()!.displayName,{size:12});ui.row('online actions',()=>{button('Create persistent sea',makeWorld,true);button('Refresh worlds',listWorlds);});
  joinCode=ui.textField('World join code',joinCode,{width:300});button('Join by code',joinWorld);
  if(activeSession)ui.label('Session: '+activeSession,{font:'monospace',size:10,color:C.muted});
  if(room)ui.label('WORLD CODE: '+(room.joinCode||'Starting…'),{color:C.gold});
  for(const s of sessionList.slice(0,4))button('Resume '+s.sessionId.slice(0,12)+'…',()=>connect(s.sessionId));
  for(const r of roomsList.slice(0,3))ui.label((r.name||'Open sea')+' · '+r.freeSeats+' free berths',{size:11});
 }
 ui.label('LOCAL BRAIN OFFICER',{color:C.gold,size:10});delegate=ui.textField('Authorised companion participant user ID',delegate,{width:dialogWidth,maxChars:80});
 ui.row('delegate',()=>{button('Authorise crew decisions',()=>command({type:'delegate',userId:delegate}));button('Brain setup',()=>panel='brains');});
 ui.row('practice actions',()=>{button('Return to saved practice',local);button('How to sail',()=>panel='help');});
}
function dialogs(){
 const s=state?.myShip;if(!s)return;
 const titles:any={combat:'Choose a ship to pick on',crew:'Crew manifest',missions:'Contracts & rumours',away:'Launch the longboat',trade:'A little honest commerce',yard:'The shipwright’s ledger',world:'A sea worth coming back to',brains:'Your crew, your models',help:'Welcome aboard, Captain',more:'The captain’s toolkit'};
 if(!panel)return;
 const f=frame(),sc=ui.preferences().scale;
 const open=ui.style({width:dialogWidth+44}).dialog('Game panel',titles[panel]||'',true,()=>ui.scrollArea('Panel contents',{width:dialogWidth,height:Math.max(170,Math.min(650,f.height/sc-180))},()=>{
  if(panel==='crew')crewDialog(s);
  if(panel==='world')worldDialog();
  if(panel==='missions'){
   if(s.mission){ui.heading(s.mission.title);ui.paragraph('Active contract · '+s.mission.reward+' gold on completion. Progress is checked by the authoritative simulation.',dialogWidth,{size:12});button('Abandon contract',()=>command({type:'abandon'}));}
   else{for(const m of [{id:'courier',title:'A Very Discreet Delivery',desc:'Deliver 5 spice cargo to Gallows Reach.',reward:180},{id:'timber',title:'Wood You Kindly',desc:'Gather a total stock of 50 timber.',reward:110},{id:'hunter',title:'Red Sky, Red Wake',desc:'Sink one hostile ship. Keep your crew afloat.',reward:220},{id:'treasure',title:'Dead Men’s Loose Change',desc:'Send an island expedition for buried treasure.',reward:160}])ui.style('card').column(m.id,()=>{ui.row(m.id+'title',()=>{ui.label(m.title,{weight:'bold'});ui.spacer();ui.label(m.reward+' GOLD',{color:C.gold,size:11});},{width:dialogWidth-24});ui.paragraph(m.desc,dialogWidth-24,{size:11});button((s.missionsDone||[]).includes(m.id)?'Completed':'Accept contract',()=>command({type:'mission',id:m.id}),false,(s.missionsDone||[]).includes(m.id));},{width:dialogWidth,spacing:7});}
  }
  if(panel==='away'){
   const p=places.find(p=>distanceTo(s,p)<7);ui.paragraph(p?'Near '+p.name+'. Leave the captain aboard and choose two crew.':'Sail to Mossjaw Cay or Rattlebone Isle and drop anchor before launching.',dialogWidth,{size:12});
   if(s.away){ui.heading('Longboat away');ui.progress(Math.max(0,Math.min(1,1-(s.away.returnAt-state.time)/22)),dialogWidth);ui.label('Returning in '+Math.max(0,Math.ceil(s.away.returnAt-state.time))+' seconds.');}
   else{job=ui.select('Expedition',job,['Chop timber · +25 wood','Seek treasure · 35–150 gold','Salvage wreck · +12 shot, +10 wood']);for(const c of s.crew.filter((c:any)=>c.rank>0)){const checked=ui.checkbox(c.name+' · '+c.role,party.includes(c.id));if(checked&&!party.includes(c.id))party.push(c.id);if(!checked&&party.includes(c.id))party=party.filter(id=>id!==c.id);}ui.label(party.length+' / 2 selected',{color:party.length===2?C.green:C.red,size:11});button('Lower the longboat',()=>command({type:'away',job:['timber','treasure','salvage'][job],crewIds:party}),true,party.length!==2);}
  }
  if(panel==='trade'){
   const p=places.find(p=>p.kind==='port'&&distanceTo(s,p)<7);ui.paragraph(p?'Docked near '+p.name+'. The quartermaster has a surprisingly honest face.':'Sail to Saltwick or Gallows Reach, then anchor to trade.',dialogWidth,{size:12});
   ui.label('Purse: '+Math.floor(s.gold)+' gold · Spice cargo: '+s.cargo+' / 50',{color:C.gold});
   button('Buy 5 spice · '+(p?.id==='gallows'?65:40)+' gold',()=>command({type:'trade',item:'buy'}),false,!p||!s.anchored);
   button('Sell all spice · '+s.cargo*(p?.id==='gallows'?23:15)+' gold',()=>command({type:'trade',item:'sell'}),true,!p||!s.anchored);
   button('Resupply & patch hull · 65 gold',()=>command({type:'trade',item:'supplies'}),false,!p||!s.anchored);
   ui.paragraph('Saltwick sells spices cheaply. Gallows Reach pays more. Resupply adds 20 shot, 20 timber, 20 hull and fills provisions.',dialogWidth,{size:12});
  }
  if(panel==='combat'){
   ui.paragraph('Broadside range: 17 fathoms. Cost: 2 shot. Reload: 7 seconds. Assign at least one crew member to Guns.',dialogWidth,{size:12});
   for(const target of state.raiders.concat(state.ships.filter((t:any)=>t.id!==me))){ui.row('target-'+target.id,()=>{button(target.name,()=>selectedEnemy=target.id,selectedEnemy===target.id);ui.label(Math.round(distanceTo(s,target))+' fathoms · hull '+Math.round(target.hull),{size:11});});}
   button('Close with selected target',()=>command({type:'pursue',target:selectedEnemy}));button('Fire at selected ship',()=>command({type:'fire',target:selectedEnemy}),true);
  }
  if(panel==='yard'){
   ui.paragraph('The Mildly Reinforced Inconvenience',dialogWidth,{size:21,font:'serif'});ui.paragraph('Fit reinforced timbers at any port. +25 permanent max hull, a full repair and 100 ship XP. Level-ups add another 10 max hull.',dialogWidth,{size:13});
   ui.label('Ship Lv '+s.level+' · '+Math.floor(s.xp)+' / '+s.level*100+' XP',{color:C.gold});meter('Hull',s.hull,s.maxHull,C.green,dialogWidth);button('Fit reinforced hull · 250 gold',()=>command({type:'upgrade'}),true);
  }
  if(panel==='brains'){
   ui.paragraph('StarHermit intentionally does not expose arbitrary HTTP to game scripts. The included local brain officer calls your models and submits bounded decisions through the platform API as an authorised participant.',dialogWidth,{size:12});
   ui.label('1. Install the companion from the source download.',{size:12});ui.label('2. Start the tiny CPU model, or configure your endpoints.',{size:12});ui.label('3. Join the sea with a separate companion account.',{size:12});ui.label('4. Authorise that user ID in World & crew.',{size:12});
   ui.paragraph('Default: SmolLM2-135M-Instruct, Q4_K_M (~105 MB), llama.cpp on CPU. Each crew member can override the base URL, model and API-key environment variable in its own configuration.',dialogWidth,{size:12});
   ui.paragraph('llama-server -hf QuantFactory/SmolLM2-135M-Instruct-GGUF:Q4_K_M',dialogWidth,{font:'monospace',size:10});
   ui.column('brain setup',()=>{button('Export per-character config',exportBrains,true);button('Configure a character',()=>{panel='crew';tab='brain';updateBrainFields();});});
   ui.paragraph('Decision-only v0.1: JSON task choices. Pirate shouts are authored game lines. The default instinct scheduler keeps the game playable when a model is absent, slow or invalid.',dialogWidth,{size:11});
  }
  if(panel==='more'){for(const [label,id] of [['Contracts','missions'],['Combat targets','combat'],['Shipyard','yard'],['Standing orders','crew'],['How to sail','help']])button(label,()=>panel=id);}
  if(panel==='help'){
   for(const text of ['1  Pick an island or port and set course. The crew sails for you.','2  Set a standing directive; crew choose tasks from their roles.','3  Give direct orders or praise good work to teach task preferences.','4  Zoom in with E to inspect three decks. Q returns to the sea.','5  Anchor at islands and send two crew on a longboat expedition.','6  Trade spice between ports, fulfil contracts and level up.','7  Assign Little Fuse to Guns, close to 17 fathoms and fire with F.'])ui.paragraph(text,dialogWidth,{size:13});
   ui.paragraph('Instincts run immediately. Local LLMs are optional, decision-only and validated by the authority. Progress in local practice is saved on this device.',dialogWidth,{size:11});
  }
  ui.row('close panel',()=>{ui.spacer();button('Back to the sea',()=>panel='',true);},{width:dialogWidth});
 }));if(!open)panel='';
}
onRender(()=>{
 const f=frame(),scale=ui.preferences().scale,w=f.width,h=f.height,mobile=w/scale<1000;
 if(w<1||h<1)return;
 renderScene();header(w,scale,mobile);toolbar(w,scale,mobile);
 const lw=w/scale,lh=h/scale;dialogWidth=Math.max(260,Math.min(530,lw-70));
 if(!mobile){navPanel(20,144,230,lh-330,scale);ordersPanel(lw-297,144,277,lh-330,scale);}
 else if(mobilePanel)ordersPanel(12,192,lw-24,lh-192-168,scale);
 if(state?.myShip){
  if(mobile){ui.area({x:12*scale,y:137*scale,width:(lw-24)*scale,height:48*scale},()=>ui.row('Mobile actions',()=>{button('Course',()=>panel='mobileNav');button('Crew',()=>openCrew(selectedCrew));button('Longboat',()=>panel='away');button('Trade',()=>panel='trade');button('More',()=>panel='more');},{spacing:5}));}
  if(panel==='mobileNav'){ui.dialog('Destinations','Chart a course',true,()=>{for(const p of places)button(p.name,()=>{route(p.id);panel='';});button('Contracts',()=>panel='missions');button('Close',()=>panel='');});}
 }
 bottom(w,h,scale,mobile);
 if(panel!=='mobileNav')dialogs();
 if(noticeTime>0){draw.box(w/2-260*scale,132*scale,520*scale,55*scale,'toast');draw.text(notice.length>100?notice.slice(0,100)+'…':notice,w/2,148*scale,{size:12*scale,color:C.ink,align:'center'});}
 // Model providers never receive platform tokens or authority handles.
});
