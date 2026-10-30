import { frame, onStart, onRender, onUpdate, onQuit, onSuspend, onResume, files, openMenu } from 'starhermit:engine';
import { scene, renderer, Color, AmbientLight, DirectionalLight, PerspectiveCamera, Mesh, InstancedMesh, Group, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, PlaneGeometry, MeshStandardMaterial, BufferGeometry, Float32BufferAttribute, Vector3, DoubleSide, Fog } from 'starhermit:scene';
import { onAction, onWheel, onPointerButton, isDown } from 'starhermit:input';
import { authority } from 'starhermit:script';
import { storage } from 'starhermit:storage';
import * as platform from 'starhermit:platform';
import * as ui from 'starhermit:ui';
import * as draw from 'starhermit:draw';
import { cue, soundSettings } from './sound.js';
import { BrowserBrain } from './brain/browser.js';
import { LOADS, loadSetting } from './brain/policy.js';
import { METRES, SHIP_SCALE, bearing, compass, clock, daylight, windSpeed, smoothPose, boatProgress } from './navigation.js';

// The renderer, input, UI, storage, practice authority and online sockets are
// all the real StarHermit host API. No browser-only replacement renderer.
const C={ink:'#0f1a20',panel:'#20160f',cream:'#f3e6c6',gold:'#e4b660',muted:'#b9a888',edge:'#6e5230',red:'#e3836b',green:'#a9d39b',brass:'#c8963e',teak:'#2a1c12',parchment:'#ead9b1',tar:'#120c08'};
const taskNames:any={helm:'Helm',lookout:'Lookout',guns:'Guns',repair:'Repair',cook:'Galley',forage:'Forage',rest:'Rest'};
const dirs=['prosper','explore','hunt','survive'];
const dirNames=['Make our fortune','See what’s out there','Hunt the bastards','Keep everyone alive'];
let shipNameDraft='',activeSession='',state:any=null,channel:any=null,online=false,network='Local practice · saved on device',me='captain-local';
let selectedPlace='mossjaw',selectedCrew='peg',selectedEnemy='redwake',panel='',tab='voyage',zoom=0,targetZoom=0,deck=0;
let notice='',noticeTime=0,elapsed=0,saveClock=0,orderText='',issuer=0,override=false,job=0,party=['peg','pip'];
let room:any=null,roomSocket:any=null,roomsList:any[]=[],sessionList:any[]=[],joinCode='',worldName='The Quarrelsome Sea',worldPublic=false,delegate='',endpoint='http://127.0.0.1:8080/v1',model='smollm2-135m',apiKeyEnv='',brainMode=0;
let brainConfigs:any=storage.getJson('crew-brains')||{};
// Legacy "tiny" entries configured the localhost launcher. They now select
// the browser default; external endpoints remain an explicit provider.
for(const id of Object.keys(brainConfigs))if(brainConfigs[id]?.mode==='tiny')brainConfigs[id]={mode:'browser'};
let effectsOn=storage.getJson('sound-effects')!==false,seaOn=storage.getJson('sea-ambience')===true;
const browserBrain=new BrowserBrain();
browserBrain.setLoad(loadSetting(storage.getJson('brain-cpu-load')));
function brainLoadControl(){ui.label('Browser brain CPU usage',{size:12,color:C.gold,weight:'bold'});const value=ui.select('CPU usage · shared by all browser brains',browserBrain.load,LOADS.map(s=>s.name));if(value!==browserBrain.load){browserBrain.setLoad(value);storage.setJson('brain-cpu-load',value);}ui.paragraph('One inference lane. Targets 10% / 25% / 50% of one CPU core over time. Short work slices and idle gaps keep the game responsive; exact CPU usage varies by device. Pauses when hidden.',dialogWidth,{size:11});}

let labelHits:any[]=[],mobilePanel=false,dialogWidth=530;
const camera=new PerspectiveCamera(45,16/9,.1,2500);
renderer.camera=camera;scene.background=new Color('#92bbb3');scene.fog=new Fog('#92bbb3',850,1650);
const sun=new DirectionalLight('#ffe8bb',1.35*Math.PI);sun.position.set(-20,45,15);const ambient=new AmbientLight('#b3d7d2',.8*Math.PI);scene.add(sun,sun.target,ambient);
const materials:any={};
const cubeGeometry=new BoxGeometry(1,1,1);
const sphereGeometry=new SphereGeometry(1,10,7);
const cylinderGeometries:any={};
function mat(color:string,rough=0.85){if(!materials[color])materials[color]=new MeshStandardMaterial({color,roughness:rough});return materials[color];}
function box(g:any,x:number,y:number,z:number,w:number,h:number,d:number,color:string){const m=new Mesh(cubeGeometry,mat(color));m.scale.set(w,h,d);m.position.set(x,y,z);g.add(m);return m;}
function sphere(g:any,x:number,y:number,z:number,r:number,color:string){const m=new Mesh(sphereGeometry,mat(color));m.scale.set(r,r,r);m.position.set(x,y,z);g.add(m);return m;}
function cylinder(g:any,x:number,y:number,z:number,rt:number,rb:number,h:number,color:string,n=8){const key=[rt,rb,h,n].join(',');if(!cylinderGeometries[key])cylinderGeometries[key]=new CylinderGeometry(rt,rb,h,n);const m=new Mesh(cylinderGeometries[key],mat(color));m.position.set(x,y,z);g.add(m);return m;}
const sea=new Mesh(new PlaneGeometry(2400,2400),mat('#397c7c',.3));sea.rotation.x=-Math.PI/2;sea.position.y=-2.1;scene.add(sea);
const waves:any[]=[],waveGroups=[new InstancedMesh(cubeGeometry,mat('#68a49a'),35),new InstancedMesh(cubeGeometry,mat('#4b8c87'),70)];
for(const group of waveGroups)scene.add(group);
const waveCounts=[0,0];
for(let i=0;i<105;i++){const group=i%3===0?0:1,index=waveCounts[group]++,x=Math.sin(i*132.7)*58,z=Math.cos(i*67.3)*55,width=.9+(i%4)*.45,a=waveGroups[group].instanceMatrix.array;const j=index*16,c=Math.cos(-.35),sn=Math.sin(-.35);a[j]=c*width;a[j+2]=-sn*width;a[j+5]=.025;a[j+8]=sn*.1;a[j+10]=c*.1;a[j+12]=x*METRES;a[j+13]=-2.0;a[j+14]=z*METRES;a[j+15]=1;waves.push({group,index,width});}
for(const group of waveGroups)group.instanceMatrix.needsUpdate=true;
function batchStatic(g:any){
 const batches:any[]=[];
 for(const child of g.children.slice()){if(!(child instanceof Mesh)||child instanceof InstancedMesh)continue;let batch=batches.find(b=>b.geometry===child.geometry&&b.material===child.material);if(!batch){batch={geometry:child.geometry,material:child.material,meshes:[]};batches.push(batch);}batch.meshes.push(child);}
 for(const batch of batches){if(batch.meshes.length<2)continue;const instances=new InstancedMesh(batch.geometry,batch.material,batch.meshes.length);for(let i=0;i<batch.meshes.length;i++){const mesh=batch.meshes[i];mesh.updateMatrix();instances.setMatrixAt(i,mesh.matrix);g.remove(mesh);}instances.instanceMatrix.needsUpdate=true;g.add(instances);}
}
const places:any[]=[
 {id:'saltwick',name:'Saltwick',kind:'port',x:-22,z:8,tag:'A respectable den of thieves'},
 {id:'mossjaw',name:'Mossjaw Cay',kind:'island',x:12,z:17,tag:'Timber, treasure & terrible mosquitoes'},
 {id:'gallows',name:'Gallows Reach',kind:'port',x:25,z:-19,tag:'Rum dear. Manners optional.'},
 {id:'rattle',name:'Rattlebone Isle',kind:'island',x:-22,z:-23,tag:'Dead men tell excellent directions'},
 {id:'wreck',name:'The Crooked Wreck',kind:'wreck',x:32,z:23,tag:'Salvage for the morally flexible'},
 {id:'brasshaven',name:'Brasshaven',kind:'port',x:-44,z:36,tag:'Canvas, foundries and ambitious invoices'},
 {id:'winterwake',name:'Winterwake',kind:'port',x:38,z:-45,tag:'Cold water. Warm purses.'},
 {id:'cinder',name:'Cinder Shoal',kind:'island',x:48,z:-2,tag:'Black sand and a sailor’s buried wages'},
 {id:'whisper',name:'Whispering Key',kind:'island',x:-45,z:-38,tag:'A grove that remembers every visitor'}
];
function tree(g:any,x:number,z:number,scale=1){cylinder(g,x,1.8*scale,z,.14*scale,.22*scale,2.1*scale,'#816646',5);for(let j=0;j<3;j++){const m=new Mesh(new ConeGeometry((1.5-j*.32)*scale,2.1*scale,7),mat(j===1?'#527e61':'#42694f'));m.position.set(x,(2.2+j*.8)*scale,z);g.add(m);}}
function house(g:any,x:number,z:number,col:string){box(g,x,1.7,z,1.9,2.0,1.8,'#e5d1a9');const roof=new Mesh(new ConeGeometry(1.75,1.2,4),mat(col));roof.rotation.y=Math.PI/4;roof.position.set(x,3.1,z);g.add(roof);box(g,x,1.8,z+.92,.48,.6,.05,'#705741');box(g,x+.55,2,z+.93,.3,.4,.05,'#e7bc6e');}
for(let i=0;i<places.length;i++){
 const p=places[i],g=new Group();g.position.set(p.x*METRES,0,p.z*METRES);g.scale.set(3,3,3);scene.add(g);
 if(p.kind==='wreck'){box(g,0,-.05,0,3,1.0,7,'#5e4b3c').rotation.z=.28;box(g,.3,2,0,.18,4,.18,'#8b7252').rotation.z=.3;for(let j=0;j<5;j++)box(g,Math.sin(j)*2,-.2,Math.cos(j)*3,1,.3,.7,'#b39a72');batchStatic(g);continue;}
 cylinder(g,0,-.15,0,5.0,5.6,.8,'#b8b98e',12);cylinder(g,0,.25,0,4.5,5.0,.65,'#dabf88',12);cylinder(g,.3,.65,-.2,3.9,4.4,.6,i===3?'#7d937b':'#86a27b',11);
 if(p.kind==='port'){
  house(g,-1,0,'#a85c51');house(g,1.7,-1,'#79736b');house(g,-1.8,-2.1,'#9a6951');
  cylinder(g,2,3,-2.5,.6,.8,4.4,'#efe4c9',8);cylinder(g,2,5.3,-2.5,.9,.7,.5,'#8d5848',8);sphere(g,2,5,-2.5,.35,'#f2cf82');
  box(g,0,.2,5.7,2,.3,4.7,'#8d7354');for(let q=0;q<7;q++)box(g,0,.4,4+q*.55,2,.08,.08,'#b5996c');
  for(let q=0;q<2;q++)cylinder(g,q?1:-1,.7,7,.12,.12,1.2,'#72583f');tree(g,-3,1,.65);
 }else{for(let j=0;j<7;j++)tree(g,Math.sin(j*8.3)*2.6,Math.cos(j*3.4)*2.5,.65+(j%3)*.15);cylinder(g,-1,1.1,1,.9,1.2,1.2,'#8a9480',6);if(i===3){sphere(g,1,1,2,.7,'#ddd9bb');sphere(g,.75,1.12,2.58,.16,'#4a514a');sphere(g,1.25,1.12,2.58,.16,'#4a514a');}else{box(g,1,1.0,2,1.2,.65,.8,'#91663f');box(g,1,1.1,2.42,.15,.4,.05,'#dfbd61');}}
 batchStatic(g);
}
const ships:any={},shots:any[]=[];let sceneSky='';
function cannonShot(from:any,to:any){if(!from||!to||shots.length>=24)return;const mesh=sphere(scene,from.x*METRES,5.4,from.z*METRES,.3,'#34423e');shots.push({mesh,from:{x:from.x*METRES,z:from.z*METRES},to:{x:to.x*METRES,z:to.z*METRES},age:0});}
let longboat:any=null,shoreParty:any=null;let snapshotAt=0,frameDt=1/60,cameraYaw=Math.atan2(30,39),cameraRange=1;const poses:any={};
function makeLongboat(){const g=new Group();box(g,0,0,0,.9,.3,2,'#916946');box(g,0,.19,0,.65,.08,1.6,'#c19c64');for(let i=0;i<2;i++){const doll=crewDoll(i?'#8aadaf':'#77a891',i+2);doll.scale.set(.65,.65,.65);doll.position.set(0,.22,i?-.45:.45);g.add(doll);}const oars=[];for(let i=0;i<2;i++)oars.push(box(g,i?1:-1,.3,0,1.5,.06,.12,'#ddc38c'));g.userData.oars=oars;g.scale.set(2.6,2.6,2.6);scene.add(g);return g;}
function crewDoll(color:string,index:number){const g=new Group();cylinder(g,0,.35,0,.17,.22,.45,color,7);sphere(g,0,.75,0,.23,'#efd0a4');const hat=sphere(g,0,.9,-.02,.24,color);hat.scale.y=.12;box(g,0,.84,.1,.48,.06,.35,color);sphere(g,-.085,.78,.20,.035,'#222f30');sphere(g,.085,.78,.20,.035,'#222f30');const limbs=[];for(let side=0;side<2;side++){limbs.push(box(g,side?.10:-.10,.08,0,.10,.24,.12,'#514d43'));limbs.push(box(g,side?.25:-.25,.36,0,.09,.36,.10,color));}g.userData.limbs=limbs;if(index===0){box(g,0,1.0,0,.66,.12,.23,'#353f3b');box(g,0,1.08,0,.35,.19,.15,'#353f3b');}g.userData.uniform=g.children.filter((child:any)=>child instanceof Mesh&&child.material===mat(color));return g;}
function buildShip(id:string,enemy=false){
 const sails:any[]=[];const g=new Group(),hull=new Group(),rig=new Group(),guns=new Group(),hold=new Group(),section=new Group(),people=new Group();g.add(hull,rig,guns,hold,section,people);g.scale.set(SHIP_SCALE,SHIP_SCALE,SHIP_SCALE);scene.add(g);
 // A faceted boat hull with a pointed bow, authored as geometry for the engine.
 const v:number[]=[],indices:number[]=[];
 const sections=[[-3.8,.85],[-2.7,1.65],[1.8,1.55],[4.2,.04]];
 for(let i=0;i<sections.length;i++){const z=sections[i][0],w=sections[i][1];v.push(-w,1.15,z,w,1.15,z,-w*.68,-1.8,z,w*.68,-1.8,z);}
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
  const sail=new Mesh(new PlaneGeometry(j?2.9:4.1,j?2.3:2.8,4,3),new MeshStandardMaterial({color:enemy?'#bb6b57':'#f1e5bc',side:DoubleSide,roughness:1}));sail.position.set(0,3.9,z+.13);sail.rotation.y=-.16;rig.add(sail);sails.push(sail);
  if(!j){sails.push(sphere(rig,-.3,4.3,z+.19,.16,'#655b4d'),sphere(rig,.3,4.3,z+.19,.16,'#655b4d'),box(rig,0,3.7,z+.2,.63,.14,.03,'#655b4d'));}
 }
 const flag=new Mesh(new PlaneGeometry(1.2,.65),new MeshStandardMaterial({color:'#33443e',side:DoubleSide}));flag.position.set(.6,6.4,1);rig.add(flag);sphere(rig,.6,6.42,1.02,.17,'#efe0b7');
 // The far wall and deck ledges preserve vertical context in the cutaway.
 box(section,-1.45,-.15,-.15,.1,2.8,6.7,'#775438');box(section,0,-.15,-3.45,2.9,2.8,.1,'#775438');
 for(const y of [1.25,.2,-.8])box(section,-1.37,y,-.15,.18,.09,6.7,'#dfbd7e');
 for(let i=0;i<10;i++)box(section,-1.12,-.65+i*.2,1.6,.48,.06,.16,'#b99a68');section.visible=false;batchStatic(section);
 // Fixed deck elevations: weather +1.3, gun +0.3, hold -0.7.
 box(guns,0,.2,0,3.0,.12,6.8,'#9b7954');
 for(let j=0;j<3;j++)for(const side of [-1,1]){const cannon=cylinder(guns,side*1.3,.55,-1.6+j*1.5,.14,.17,.8,'#414e4b',8);cannon.rotation.z=Math.PI/2;box(guns,side*1.1,.35,-1.6+j*1.5,.45,.14,.48,'#584a39');}
 box(hold,0,-.8,0,2.9,.12,6.6,'#80664c');
 for(let j=0;j<4;j++){box(hold,-.9,-.5,-2+j*1.2,.6,.5,.7,'#b68b54');cylinder(hold,.9,-.48,-2+j*1.2,.27,.27,.5,'#916946');}
 guns.visible=false;hold.visible=false;
 const dolls:any[]=[];for(let i=0;i<6;i++){const c=crewDoll(['#b25952','#dda854','#7d88a2','#77a891','#c57c9b','#8aadaf'][i],i);c.scale.set(.55,.55,.55);const tool=new Group();box(tool,.34,.56,0,.05,.6,.05,'#b69863');box(tool,.34,.86,0,.26,.15,.12,'#788983');c.add(tool);c.userData.tool=tool;people.add(c);dolls.push(c);}
 batchStatic(hull);batchStatic(guns);batchStatic(hold);
 const flames:any[]=[];for(let i=0;i<4;i++){const flame=sphere(g,(i%2?-.8:.8),1.7+i*.2,-1.4+i*.8,.24,i%2?'#f5bf58':'#e37848');flame.visible=false;flames.push(flame);}
 const o={g,hull,rig,sails,guns,hold,section,people,dolls,flames,enemy};ships[id]=o;return o;
}
const taskPos:any={helm:[0,-2.4],lookout:[.8,2.3],guns:[-1.0,0],repair:[.9,-.7],cook:[-.7,-1.7],forage:[.8,1.3],rest:[-.7,-2.4]};
function flash(text:string){notice=text;noticeTime=7;}
function command(c:any){if(!channel||!channel.sendCommand(c))flash('The channel is busy. Try again in a moment.');}
function got(data:any){if(!data)return;if(data.type==='snapshot'&&!online){lastSnapshot=data.world;storage.setJson('practice-world',lastSnapshot);return;}if(data.type!=='state')return;const oldDelegate=state?.myShip?.delegate;if(state){const previous=state.ships.concat(state.raiders),current=data.ships.concat(data.raiders);for(const ship of current){const old=previous.find((x:any)=>x.id===ship.id);if(old&&ship.lastShot>old.lastShot)cannonShot(ship,current.find((x:any)=>x.id===ship.lastTarget));}}if(state?.myShip?.id===data.myShip?.id){const known=new Set(state.myShip.log.map((e:any)=>e.at+'|'+e.name+'|'+e.text));for(const entry of data.myShip.log.filter((e:any)=>!known.has(e.at+'|'+e.name+'|'+e.text)).slice(-2))cue(entry.kind);}if(!state&&data.myShip)console.info('Authoritative ship ready: '+data.myShip.crew.length+' crew.');state=data;snapshotAt=elapsed;if(state.myShip&&oldDelegate!==state.myShip.delegate)delegate=state.myShip.delegate||'';}
function watch(c:any){c.on('game',got);c.on('error',(e:any)=>flash(String(e)));c.on('open',()=>c.sendCommand({type:'sync'}));c.on('stopped',(e:any)=>{network='Disconnected · '+e;flash('Connection ended: '+e+'. Open World to reconnect.');});}
function local(){if(roomSocket){roomSocket.close();roomSocket=null;}room=null;if(channel)channel.close();state=null;shipNameDraft='';online=false;me='captain-local';const saved:any=storage.getJson('practice-world');channel=authority('server.js',{context:{sessionId:'brine-local',players:[{id:me,name:'Captain'}],sessionState:saved||null},rate:4});watch(channel);network='Local practice · saved on device';}
function connect(id:string){activeSession=id;if(channel)channel.close();state=null;shipNameDraft='';me=platform.player()?.userId||'';online=true;channel=platform.connectGame(id);watch(channel);network='StarHermit · connecting';channel.on('open',()=>{network='StarHermit · persistent world';});channel.on('disconnected',()=>{network='Reconnecting to StarHermit…';});}
async function listWorlds(){try{sessionList=await platform.sessions.list();roomsList=await platform.rooms.browse({inProgress:true});}catch(e){flash(String(e));}}
async function makeWorld(){try{if(roomSocket){roomSocket.close();roomSocket=null;}room=await platform.rooms.create({name:worldName.trim()||'The Quarrelsome Sea',teamCount:1,seatsPerTeam:8,isVisible:worldPublic,joinInProgress:true,backfillAiPlayers:0});room=await platform.rooms.open(room.id);roomSocket=platform.rooms.connect(room.id);roomSocket.on('roster',(r:any)=>{if(!room||r.id!==room.id)return;room=r;if(r.gameSessionId&&(!online||activeSession!==r.gameSessionId))connect(r.gameSessionId);});room=await platform.rooms.start(room.id);if(room.gameSessionId)connect(room.gameSessionId);}catch(e){flash(String(e));}}
async function joinWorld(){try{if(roomSocket){roomSocket.close();roomSocket=null;}room=await platform.rooms.joinByCode(joinCode.trim());roomSocket=platform.rooms.connect(room.id);roomSocket.on('roster',(r:any)=>{if(!room||r.id!==room.id)return;room=r;if(r.gameSessionId&&(!online||activeSession!==r.gameSessionId))connect(r.gameSessionId);});if(room.gameSessionId)connect(room.gameSessionId);else flash('Joined. Waiting for the host to start this sea.');}catch(e){flash(String(e));}}
async function joinOpenWorld(){try{if(roomSocket){roomSocket.close();roomSocket=null;}const found=await platform.rooms.quickJoin({includeInProgress:true});if(!found){flash('No listed sea has an open berth. Create one or join by code.');return;}room=found;if(roomSocket)roomSocket.close();roomSocket=platform.rooms.connect(room.id);roomSocket.on('roster',(r:any)=>{if(!room||r.id!==room.id)return;room=r;if(r.gameSessionId&&(!online||activeSession!==r.gameSessionId))connect(r.gameSessionId);});if(room.gameSessionId)connect(room.gameSessionId);else flash('Joined an open sea. Waiting for its captain to start.');}catch(e){flash(String(e));}}
function updateBrainFields(){const c=brainConfigs[selectedCrew]||{};endpoint=c.base_url||'http://127.0.0.1:8080/v1';model=c.model||'smollm2-135m';apiKeyEnv=c.api_key_env||'';brainMode=c.mode==='endpoint'?1:0;}
function saveBrain(){browserBrain.cancel();brainConfigs[selectedCrew]=brainMode?{mode:'endpoint',base_url:endpoint,model,api_key_env:apiKeyEnv}:{mode:'browser'};storage.setJson('crew-brains',brainConfigs);flash(brainMode?'Endpoint saved. Export it for the companion officer.':'Browser brain saved · '+LOADS[browserBrain.load].name+'.');}
function exportBrains(){saveBrain();files.saveAs('crew-brains.json',JSON.stringify({schema:1,default:{mode:'browser'},browser_cpu:LOADS[browserBrain.load].name,crew:brainConfigs},null,2),{type:'application/json'}).catch(e=>flash(String(e)));}
function meter(name:string,v:number,max:number,color:string,width=215){ui.row(name,()=>{ui.label(name,{color:C.muted,size:11});ui.spacer();ui.label(Math.round(v)+' / '+max,{size:11,color});},{width});ui.style({parts:{fill:{background:color},track:{background:'#3a2716'}},height:5}).progress(v/max,width);}
function button(label:string,fn:()=>void,selected=false,disabled=false){if(ui.style(selected?'gold':'soft').button(label,{selected,disabled}))fn();}
function wideButton(label:string,fn:()=>void,selected=false){if(ui.style({width:dialogWidth}).button(label,{selected,content:()=>ui.paragraph(label,dialogWidth-24,{size:12})}))fn();}
function helmControls(){
 ui.grid('Manual helm',()=>{for(const item of [{label:'Port',turn:-1,throttle:1},{label:'Ahead',turn:0,throttle:1},{label:'Starboard',turn:1,throttle:1}]){const result=ui.widget(item.label,{role:'button',size:{width:72,height:36},style:'soft',draw:(rect,style)=>draw.text(item.label,rect.x+rect.width/2,rect.y+9*frame().scale,{size:12*frame().scale,color:style.colors.text,align:'center'})});if(result.pressed||result.activated){touchTurn=item.turn;touchThrottle=item.throttle;}}button('Stop',()=>command({type:'helm-input',turn:0,throttle:0}));},{columns:dialogWidth<380?2:4,width:Math.min(dialogWidth,340),gap:5});
}
function steer(dt:number){
 helmClock+=dt;const s=state?.myShip;
 if(s?.controlMode!=='manual'||s.away||s.boarding){manualSending=false;return;}
 const turn=touchTurn||(!ui.capturingKeys()?Number(isDown('starboard'))-Number(isDown('port')):0),throttle=touchThrottle||(!ui.capturingKeys()&&isDown('sailahead')?1:0);
 if(helmClock>=.4&&(throttle||manualSending)){helmClock=0;command({type:'helm-input',turn,throttle});manualSending=!!throttle;}
}
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
 soundSettings(effectsOn,seaOn);
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
 local();if(!storage.getJson('captain-welcomed')){panel='help';storage.setJson('captain-welcomed',true);}const launched=platform.launchContext();if(launched?.sessionId)connect(launched.sessionId);
});
onAction(e=>{if(!e.pressed||ui.capturingKeys())return;if(e.action==='zoomin')targetZoom=1;if(e.action==='zoomout'||e.action==='map')targetZoom=0;if(e.action==='takehelm')command({type:'helm-mode',mode:state?.myShip?.controlMode==='manual'?'course':'manual'});if(e.action==='anchor')command({type:'anchor'});if(e.action==='fire')command({type:'fire',target:selectedEnemy,ammunition:['round','chain','grape'][ammoType]});if(e.action==='crew')openCrew(selectedCrew);});
onWheel((_,dy)=>{if(!ui.pointerOver())targetZoom=Math.max(0,Math.min(1,targetZoom-dy*.15));});
onPointerButton(e=>{if(e.pressed||e.button!==0||ui.pointerOver())return;for(const l of labelHits)if(e.x>=l.x&&e.x<=l.x+l.w&&e.y>=l.y&&e.y<=l.y+l.h){if(l.crew)openCrew(l.id);else selectedPlace=l.id;return;}});
onUpdate(dt=>{frameDt=Math.min(dt,.1);for(let i=shots.length-1;i>=0;i--){const shot=shots[i];shot.age+=dt;const t=Math.min(1,shot.age/.6);shot.mesh.position.set(shot.from.x+(shot.to.x-shot.from.x)*t,5.4+Math.sin(t*Math.PI)*2.4,shot.from.z+(shot.to.z-shot.from.z)*t);if(t>=1){scene.remove(shot.mesh);shots.splice(i,1);}}elapsed+=dt;noticeTime=Math.max(0,noticeTime-dt);zoom+=(targetZoom-zoom)*Math.min(1,dt*5);saveClock+=dt;if(saveClock>10&&state&&!online){saveClock=0;command({type:'snapshot'});}steer(dt);browserBrain.tick(state,brainConfigs,command,channel);});
onSuspend(()=>{touchTurn=0;touchThrottle=0;manualSending=false;browserBrain.suspend();});onResume(()=>browserBrain.resume());
onQuit(()=>{if(state&&!online&&lastSnapshot)storage.setJson('practice-world',lastSnapshot);});
let lastSnapshot:any=null,helmClock=0,touchTurn=0,touchThrottle=0,ammoType=0,manualSending=false;
// The practice snapshot is reconstructed only from the authority's explicit
// private export; online session state never comes from device storage.
function labelAt(text:string,x:number,y:number,z:number,color:string,id?:string,crew=false){
 const f=frame(),v=new Vector3(x,y,z).project(camera),px=(v.x+1)*f.width/2,py=(1-v.y)*f.height/2;
 if(px<20||px>f.width-20||py<(f.width/ui.preferences().scale<600?280*f.scale:100)||py>f.height-180)return;
 const limit=f.width-40*f.scale;let trimmed=false;while(text.length>3&&draw.measureText(text,{size:12*f.scale}).width>limit){text=text.slice(0,-2);trimmed=true;}if(trimmed)text+='…';
 const width=draw.measureText(text,{size:12*f.scale}).width;const safeX=Math.max(width/2+12*f.scale,Math.min(f.width-width/2-12*f.scale,px));
 draw.box(safeX-width/2-9*f.scale,py-6*f.scale,width+18*f.scale,27*f.scale,'tag');
 draw.text(text,safeX,py,{size:12*f.scale,color,align:'center'});
 if(id){const hit={x:safeX-width/2-9*f.scale,y:py-6*f.scale,w:width+18*f.scale,h:27*f.scale,id,crew};labelHits.push(hit);ui.target(text,{x:hit.x,y:hit.y,width:hit.w,height:hit.h});}
}
function renderScene(){
 const f=frame(),s=state?.myShip;camera.aspect=f.width/Math.max(1,f.height);camera.updateProjectionMatrix();
 const allShips=state?state.ships.concat(state.raiders):[];
 for(const ship of allShips)poses[ship.id]=smoothPose(poses[ship.id],ship,frameDt);
 const shipPose=s?poses[s.id]||s:{x:0,z:0},focus={x:shipPose.x,z:shipPose.z};
 if(s?.away){const p=places.find(p=>p.id===s.away.place)!,dx=shipPose.x-p.x,dz=shipPose.z-p.z,d=Math.max(.1,Math.hypot(dx,dz)),move=boatProgress(state.time+Math.min(.3,elapsed-snapshotAt),s.away);focus.x+=(p.x+dx/d*1.2-shipPose.x)*move;focus.z+=(p.z+dz/d*1.2-shipPose.z)*move;}
 const cx=focus.x*zoom*METRES,cz=focus.z*zoom*METRES,dist=1-zoom;
 const narrow=f.width/ui.preferences().scale<600;cameraRange+=((narrow?1.2:1)*(s?.away?1.15:1)-cameraRange)*(1-Math.exp(-frameDt*5));const p=s?.away&&places.find(p=>p.id===s.away.place),yaw=p?Math.atan2(shipPose.x-p.x,shipPose.z-p.z):Math.atan2(30,39);cameraYaw+=Math.atan2(Math.sin(yaw-cameraYaw),Math.cos(yaw-cameraYaw))*(1-Math.exp(-frameDt*4));
 camera.position.set(cx+340*dist+Math.sin(cameraYaw)*49.2*zoom*cameraRange,660*dist+39*zoom*cameraRange,cz+540*dist+Math.cos(cameraYaw)*49.2*zoom*cameraRange);camera.lookAt(cx,zoom*4.8,cz);camera.updateMatrixWorld();
 sea.visible=!(zoom>.6&&deck>0);
 for(let i=0;i<waves.length;i++){const wave=waves[i],a=waveGroups[wave.group].instanceMatrix.array,j=wave.index*16,sx=wave.width*(1+Math.sin(elapsed+i)*.12)*3;a[j]=Math.cos(-.35)*sx;a[j+2]=-Math.sin(-.35)*sx;a[j+13]=-2+Math.sin(elapsed*1.8+i)*.06;}for(const group of waveGroups)group.instanceMatrix.needsUpdate=true;
 if(!state)return;
 const storm=state.weather!=='Fair winds',light=daylight(state.time),sky=storm?'#697f82':light>.12?'#92bbb3':'#435868';
 if(sceneSky!==sky){sceneSky=sky;scene.background=new Color(sky);scene.fog=new Fog(sky,storm?500:850,storm?1100:1650);}sun.intensity=(.35+light)*Math.PI;ambient.intensity=(.6+light*.2)*Math.PI;
 const all=state.ships.concat(state.raiders);const visible:any={};
 for(const ss of all){visible[ss.id]=true;let obj=ships[ss.id];if(!obj)obj=buildShip(ss.id,!!ss.npc);obj.g.visible=ss.hull>0;if(!obj.g.visible)continue;const mine=ss.id===me;const pose=poses[ss.id]||ss;obj.g.position.set(pose.x*METRES,Math.sin(elapsed*1.3+ss.x)*.12,pose.z*METRES);obj.g.rotation.y=pose.heading||0;obj.g.rotation.z=Math.sin(elapsed+ss.x)*.012;
  const fire=mine?s.fire:ss.fire||0;for(let i=0;i<obj.flames.length;i++){const flame=obj.flames[i];flame.visible=fire>0;if(fire>0){flame.scale.y=(.35+Math.sin(elapsed*8+i)*.10)*Math.min(2,1+fire/60);flame.position.y=1.6+i*.12+Math.sin(elapsed*5+i)*.12;}}
  const cut=mine&&zoom>.6&&deck>0;
  obj.rig.visible=!cut;for(const sail of obj.sails)sail.visible=!(mine&&zoom>.6);obj.hull.visible=!cut;obj.guns.visible=cut&&deck===1;obj.hold.visible=cut;obj.section.visible=cut;
  for(let i=0;i<obj.dolls.length;i++){const d=obj.dolls[i],c=mine?s.crew[i]:null;d.visible=(!c||!c.away)&&(!cut||(deck===1?['guns','repair'].includes(c?.task):['cook','forage','rest'].includes(c?.task)));if(c){const p=taskPos[c.task]||[0,0],slot=s.crew.slice(0,i).filter((other:any)=>!other.away&&other.task===c.task).length,watch=(elapsed+i*2)%18,walking=watch<4&&c.task!=='rest',stride=walking?Math.sin(elapsed*8+i):Math.sin(elapsed*4+i)*.3;
   d.position.set((cut?(i%2?.2:-.2):p[0])+(walking?Math.sin(watch/4*Math.PI)*.7:0),cut?(deck===1?.28:-.72):1.34,p[1]+slot*.4);d.rotation.y=walking?Math.PI/2:Math.sin(elapsed*.8+i)*.18;d.rotation.z=c.task==='rest'?Math.PI/2:0;
   d.userData.tool.visible=['repair','forage','cook'].includes(c.task);d.userData.tool.rotation.x=walking?0:Math.sin(elapsed*4+i)*.6;for(let j=0;j<d.userData.limbs.length;j++)d.userData.limbs[j].rotation.x=stride*(j%2?1:-1)*(walking?.8:1.8);
  }}

 }
 for(const id of Object.keys(ships))if(!visible[id])ships[id].g.visible=false;
 if(s?.away){if(!longboat)longboat=makeLongboat();longboat.visible=true;const p=places.find(p=>p.id===s.away.place)!,time=state.time+Math.min(.3,elapsed-snapshotAt),move=boatProgress(time,s.away),pose=poses[s.id]||s,dx=pose.x-p.x,dz=pose.z-p.z,d=Math.max(.1,Math.hypot(dx,dz)),shore={x:p.x+dx/d*1.7,z:p.z+dz/d*1.7};
  longboat.position.set((pose.x+(shore.x-pose.x)*move)*METRES,-1.9,(pose.z+(shore.z-pose.z)*move)*METRES);longboat.rotation.y=Math.atan2(shore.x-pose.x,shore.z-pose.z)+(s.away.returnAt-time<5?Math.PI:0);
  for(const oar of longboat.userData.oars)oar.rotation.y=move<1?Math.sin(elapsed*5)*.5:0;
  if(!shoreParty){shoreParty=new Group();for(let i=0;i<2;i++){const doll=crewDoll(i?'#8aadaf':'#77a891',i+2);doll.scale.set(1.8,1.8,1.8);doll.position.set(i?1.4:-1.4,0,0);box(doll,.35,.6,0,.06,.8,.06,'#b69863');box(doll,.35,1,0,.35,.2,.1,'#788983');shoreParty.add(doll);}scene.add(shoreParty);}
  shoreParty.visible=move>=1;shoreParty.position.set(p.x*METRES+dx/d*11,2.85,p.z*METRES+dz/d*11);for(let i=0;i<2;i++){const doll=shoreParty.children[i];doll.rotation.z=Math.sin(elapsed*5+i)*.16;doll.userData.limbs[3].rotation.x=Math.sin(elapsed*5+i);}
  let rower=0;for(const child of longboat.children)if(child instanceof Group){child.visible=move<1;const c=s.crew.find((c:any)=>c.id===s.away.crewIds[rower++]);for(const part of child.userData.uniform as any[])part.material=mat(c?.color||'#77a891');for(const arm of child.userData.limbs as any[])arm.rotation.x=Math.sin(elapsed*5)*.7;}for(let i=0;i<2;i++){const c=s.crew.find((c:any)=>c.id===s.away.crewIds[i]);for(const part of shoreParty.children[i].userData.uniform)part.material=mat(c?.color||'#77a891');}
 }else{if(longboat)longboat.visible=false;if(shoreParty)shoreParty.visible=false;}

 labelHits=[];if(s?.away&&zoom>.65&&shoreParty?.visible){labelAt(s.away.crewIds.map((id:string)=>s.crew.find((c:any)=>c.id===id)?.name.split(' ')[0]).join(' & ')+' · '+(s.away.job==='timber'?'Chopping timber':s.away.job==='salvage'?'Gathering salvage':'Seeking treasure'),shoreParty.position.x,6.5,shoreParty.position.z,C.gold);}
 if(zoom<.65){for(const p of places)labelAt((p.kind==='port'?'⚓ ':'')+p.name,p.x*METRES,20,p.z*METRES,selectedPlace===p.id?C.gold:C.cream,p.id);for(const ss of state.raiders)if(ss.hull>0)labelAt(ss.name,(poses[ss.id]?.x||ss.x)*METRES,24,(poses[ss.id]?.z||ss.z)*METRES,C.red);}
 else if(s){labelAt(s.name,shipPose.x*METRES,20,shipPose.z*METRES,C.gold);const l=s.log[s.log.length-1];if(l&&state.time-l.at<8)labelAt(l.name+': '+(l.text.length>54?l.text.slice(0,l.text.lastIndexOf(' ',53)>20?l.text.lastIndexOf(' ',53):53)+'…':l.text),shipPose.x*METRES,14,shipPose.z*METRES+6,C.cream);}
}
function instruments(w:number,h:number,scale:number,mobile:boolean){
 const s=state?.myShip;if(!s)return;
 const narrow=w/scale<420,y=mobile?(narrow?230:192):137;
 ui.area({x:(mobile?14:270)*scale,y:y*scale,width:(mobile?w/scale-28:w/scale-585)*scale,height:50*scale},()=>ui.column('Navigation instruments',()=>{
  ui.label('Day '+state.day+' · '+clock(state.time)+' · '+(daylight(state.time)>.1?'Daylight':'Night watch'),{size:11,color:C.cream});
  const heading=bearing(poses[s.id]?.heading||s.heading||0),wind=bearing((state.wind||0)+Math.PI);
  ui.label('HDG '+Math.round(heading).toString().padStart(3,'0')+'° '+compass(heading)+' · Wind from '+compass(wind)+' '+(state.windKnots||windSpeed(state.time,state.weather!=='Fair winds'))+' kn',{size:10,color:C.gold});
 },{spacing:3}));
 const size=narrow?100:132,x=(mobile?w/scale-size-14:w/scale-305-size)*scale,my=(h/scale-180-size)*scale,k=size/132*scale;
 draw.box(x,my,size*scale,size*scale,'tag');draw.text('N ↑  ·  SEA MAP',x+8*k,my+5*k,{size:10*k,color:C.gold});
 const point=(p:any)=>({x:x+(66+p.x*.78)*k,y:my+(74+p.z*.78)*k});
 const own=point(poses[s.id]||s),destination=places.find(p=>p.id===s.destination);
 if(destination){const to=point(destination);draw.line(own.x,own.y,to.x,to.y,C.gold,1);}
 for(const p of places){const at=point(p);draw.box(at.x-3*k,at.y-3*k,6*k,6*k,{background:selectedPlace===p.id?C.gold:p.kind==='port'?C.cream:C.green});}
 for(const raider of state.raiders)if(raider.hull>0){const at=point(poses[raider.id]||raider);draw.text('×',at.x,at.y,{size:12*k,color:C.red,align:'center'});}
 const roseX=x-33*scale,roseY=my+size*scale-29*scale,r=20*scale;
 draw.box(roseX-r-5*scale,roseY-r-12*scale,2*r+10*scale,2*r+18*scale,'tag');
 draw.line(roseX-r,roseY,roseX+r,roseY,C.muted,1);draw.line(roseX,roseY-r,roseX,roseY+r,C.muted,1);
 for(const [name,ox,oy] of [['N',0,-23],['E',24,0],['S',0,21],['W',-24,0]] as [string,number,number][])draw.text(name,roseX+ox*scale,roseY+oy*scale,{size:8*scale,color:C.cream,align:'center'});
 const head=poses[s.id]?.heading||s.heading||0,wind=state.wind||0;
 draw.line(roseX,roseY,roseX+Math.sin(head)*r,roseY+Math.cos(head)*r,C.gold,3*scale);
 draw.line(roseX-Math.sin(wind)*r,roseY-Math.cos(wind)*r,roseX+Math.sin(wind)*r,roseY+Math.cos(wind)*r,'#8bcadd',1.5*scale);
 draw.line(roseX+Math.sin(wind)*r,roseY+Math.cos(wind)*r,roseX+Math.sin(wind)*r-Math.sin(wind+.7)*7*scale,roseY+Math.cos(wind)*r-Math.cos(wind+.7)*7*scale,'#8bcadd',1.5*scale);
 const angle=poses[s.id]?.heading||s.heading||0,dx=Math.sin(angle)*8*k,dz=Math.cos(angle)*8*k;
 draw.line(own.x,own.y,own.x+dx,own.y+dz,C.gold,3*k);draw.line(own.x+dx,own.y+dz,own.x+dx-Math.sin(angle+.7)*5*k,own.y+dz-Math.cos(angle+.7)*5*k,C.gold,2*k);draw.line(own.x+dx,own.y+dz,own.x+dx-Math.sin(angle-.7)*5*k,own.y+dz-Math.cos(angle-.7)*5*k,C.gold,2*k);
}
function header(w:number,scale:number,mobile:boolean){
 draw.box(0,0,w,76*scale,'woodbar');
 ui.area({x:20*scale,y:10*scale,width:w-40*scale,height:58*scale},()=>ui.row('Header',()=>{
  ui.column('Brand',()=>{ui.heading(mobile&&w/scale<600?'Pirate Intel.':'Pirate Intelligence',{font:'serif',size:mobile?(w/scale<400?16:23):28});if(!mobile)ui.label('A FINE CREW. A TERRIBLE IDEA.',{color:C.muted,size:9});},{spacing:1});
  ui.spacer();if(!mobile&&state){for(const [name,val] of [['GOLD',Math.floor(state.myShip?.gold||0)],['TIMBER',Math.floor(state.myShip?.timber||0)],['SHOT',state.myShip?.ammo||0]])ui.column(name as string,()=>{ui.label(name as string,{size:9,color:C.muted});ui.label(String(val),{size:21,color:C.gold,weight:'bold'});},{width:80,spacing:2});}
  button('Options',()=>panel='settings');button(mobile?'World':'⚓  World & crew',()=>{panel='world';if(platform.player())listWorlds();});
 },{width:(w-40*scale)/scale,align:'center',spacing:16}));
}
function toolbar(w:number,scale:number,mobile:boolean){
 draw.box(0,76*scale,w,50*scale,'woodstrip');
 ui.area({x:20*scale,y:84*scale,width:w-40*scale,height:40*scale},()=>ui.row('Views',()=>{
  button('Sea chart',()=>{targetZoom=0;},targetZoom<.5);button('Aboard ship',()=>{targetZoom=1;},targetZoom>=.5);
  if(!mobile){ui.label('Q / E or scroll to zoom',{size:11,color:C.muted});ui.spacer();ui.label(state?.weather||'Fair winds',{size:11,color:C.muted});}
  else{ui.spacer();button('Orders',()=>{mobilePanel=!mobilePanel;});}
 },{width:(w-40*scale)/scale,align:'center',spacing:8}));
}
function navPanel(x:number,y:number,width:number,height:number,scale:number){
 const s=state?.myShip;if(!s)return;
 ui.area({x:x*scale,y:y*scale,width:width*scale,height:height*scale},()=>ui.scrollArea('Navigation rail',{width,height},()=>ui.panel('Navigation',()=>{
  ui.label('THE QUARRELSOME SEA',{color:C.gold,size:10,weight:'bold'});ui.heading(zoom>.5?'Below the bravado':'Pick your next bad idea',{size:19});button('Contracts & rumours',()=>panel='missions');button('Sea atlas',()=>panel='atlas');
  if(zoom>.5){ui.paragraph('One ship. Three decks. Six entirely individual opinions.',width-28,{size:12});for(let i=0;i<3;i++)button(['01  Weather deck','02  Gun deck','03  Cargo hold'][i],()=>{deck=i;},deck===i);ui.label(['Helm · rigging · lookout','Six guns · powder · patching','Spices · provisions · questionable cargo'][deck],{color:C.muted,size:10});if(deck===2){ui.label('Cargo: '+cargoTotal(s)+' / '+cargoLimit(s));ui.label('Spice '+s.cargo+' · Cloth '+(s.goods?.cloth||0)+' · Medicine '+(s.goods?.medicine||0));ui.label('Provisions: '+Math.round(s.food));ui.label('Timber: '+Math.floor(s.timber));}ui.style('gold').button(s.anchored?'⚓  At anchor':'Under way',{disabled:true});}
  else{for(const p of places){if(ui.style(selectedPlace===p.id?'gold':'flat').button(p.name,{content:()=>{ui.label(p.name,{weight:'bold',size:13});ui.label(p.kind==='port'?'PORT & TRADING':p.kind==='wreck'?'SALVAGE':'ISLAND & AWAY MISSIONS',{size:9});}}))selectedPlace=p.id;}
   const p=places.find(p=>p.id===selectedPlace)!;ui.paragraph(p.tag,width-28,{size:11});button('Set course  →',()=>route(p.id),true);}
  ui.label('SHIP STATUS',{size:10,color:C.gold,weight:'bold'});meter('Hull',s.hull,s.maxHull,s.hull<40?C.red:C.green,width-28);meter('Crew spirit',s.morale,100,C.gold,width-28);
  ui.label('LV '+s.level+'   '+Math.floor(s.xp)+' / '+(s.level*100)+' XP',{color:C.muted,size:10});
  button('Captain’s log',()=>panel='logbook');
 },{width,padding:14,spacing:10})));
}
function ordersPanel(x:number,y:number,width:number,height:number,scale:number){
 const s=state?.myShip;if(!s)return;
 ui.area({x:x*scale,y:y*scale,width:width*scale,height:height*scale},()=>ui.scrollArea('Captain’s desk rail',{width,height},()=>ui.panel('Captain’s desk',()=>{
  ui.label('CAPTAIN’S DESK',{color:C.gold,size:10,weight:'bold'});ui.heading('What’s the plan?',{size:22});button(s.away?'Longboat · check expedition':landing(s)?.kind==='wreck'?'Longboat · salvage wreck':'Longboat · gather timber',()=>openLongboat(),true);
  let d=ui.select('Standing directive',Math.max(0,dirs.indexOf(s.directive)),dirNames);if(d!==dirs.indexOf(s.directive))command({type:'directive',value:dirs[d]});
  ui.paragraph('Your crew chooses how to get there. Direct orders teach them your habits.',width-28,{size:11});
  ui.row('Crew header',()=>{ui.label('SIX SOULS, ONE CHAIN OF COMMAND',{color:C.gold,size:9});},{width:width-28});
  for(const c of s.crew){if(ui.id('crew-'+c.id).style('flat').button(c.name,{content:()=>{ui.row('summary-'+c.id,()=>{ui.label('●',{color:c.color,size:18});ui.column('name-'+c.id,()=>{ui.label(c.name,{size:12,weight:'bold'});ui.label(c.role+' · Lv '+c.level,{size:9,color:C.muted});},{spacing:0});ui.spacer();ui.label(c.away?'AWAY':taskNames[c.task],{size:10,color:c.away?C.gold:C.green});},{width:width-46,spacing:8,align:'center'});}}))openCrew(c.id);}
  if(s.fire>0||s.leak>0)ui.label('FIRE '+Math.ceil(s.fire||0)+' · BILGE '+Math.ceil(s.leak||0),{color:C.red,size:11});
  if(s.requests?.length)ui.paragraph(s.requests[0].text,width-28,{size:11});
  button('Standing orders & watch',()=>panel='book');
  ui.row('quick',()=>{button(s.anchored?'Anchor down':'Drop anchor',()=>command({type:'anchor'}));button('Longboat',openLongboat);},{spacing:6});
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
   if(s.controlMode==='manual'&&!s.away&&!s.boarding&&!panel)helmControls();
   ui.row('actions',()=>{button(s.away?'Longboat · expedition':landing(s)?.kind==='wreck'?'Go ashore · salvage':landing(s)?'Go ashore · timber':'Longboat',openLongboat,!!landing(s));button('Trade in port',()=>{panel='trade';});button('Fire broadside  [F]',()=>command({type:'fire',target:selectedEnemy,ammunition:['round','chain','grape'][ammoType]}));button('Targets',()=>{panel='combat';});button('Shipyard',()=>{panel='yard';});},{spacing:8});
   ui.label(s.away?'Longboat · '+(!s.away.choice&&state.time>=s.away.encounterAt?'encounter ready · ':'')+'returns in '+Math.max(0,Math.ceil(s.away.returnAt-state.time))+'s':s.destination?'Sailing to '+destination?.name+' · '+Math.round(distanceTo(s,destination)*METRES)+' m':s.mission?'CONTRACT: '+s.mission.title:'No contract. The sea is full of bad opportunities.',{size:10,color:C.muted});
  },{spacing:10});}
 },{spacing:24,width:width-40}));
}
function landing(s:any){return s.anchored?places.find(p=>p.kind!=='port'&&distanceTo(s,p)<7):null;}
function openLongboat(){const p=state?.myShip&&landing(state.myShip);if(!state?.myShip?.away)job=p?.kind==='wreck'?2:0;panel='away';}
function distanceTo(s:any,p:any){return p?Math.sqrt((s.x-p.x)**2+(s.z-p.z)**2):999;}

function portNear(s:any){return state?.places?.find((p:any)=>p.kind==='port'&&distanceTo(s,p)<7);}
function cargoTotal(s:any){return s.cargo+(s.goods?.cloth||0)+(s.goods?.medicine||0);}
function cargoLimit(s:any){return 50+(s.upgrades?.hold||0)*15;}
function ordersBook(s:any){
 ui.paragraph('Brisk coordinates free stations each watch. Captain orders reserve a station for 35 seconds; fresh model decisions also take priority over instincts.',dialogWidth,{size:12});
 const orders=s.standing||{repairAt:75,restAt:70,avoidStorm:false,autoFire:true};
 const repair=[50,75,90],rest=[60,70,85];
 let value=ui.select('Start repairs below hull',Math.max(0,repair.indexOf(orders.repairAt)),['50% · conserve timber','75% · balanced','90% · shipshape']);if(repair[value]!==orders.repairAt)command({type:'standing',rule:'repairAt',value:repair[value]});
 value=ui.select('Rest at fatigue',Math.max(0,rest.indexOf(orders.restAt)),['60% · easy watches','70% · balanced','85% · long watches']);if(rest[value]!==orders.restAt)command({type:'standing',rule:'restAt',value:rest[value]});
 const shelter=ui.checkbox('Wait out squalls at anchor',orders.avoidStorm);if(shelter!==orders.avoidStorm)command({type:'standing',rule:'avoidStorm',value:shelter});
 const firing=ui.checkbox('Fire automatically while hunting',orders.autoFire);if(firing!==orders.autoFire)command({type:'standing',rule:'autoFire',value:firing});
 ui.label('REQUESTS FROM THE CREW',{size:10,color:C.gold});
 if(!s.requests?.length)ui.paragraph('All urgent stations are covered. The crew has the watch.',dialogWidth,{size:12});
 for(const r of s.requests||[]){ui.paragraph((r.from?r.from+': ':'')+r.text,dialogWidth,{size:12});if(r.crewId)button('Assign '+r.crewId+' to '+taskNames[r.task],()=>command({type:'order',crewId:r.crewId,task:r.task,issuer:'brisk',override:false}));}
 ui.label('CURRENT WATCH',{size:10,color:C.gold});
 for(const c of s.crew){ui.label(c.name+' · '+(c.away?'ashore':taskNames[c.task]),{size:12,weight:'bold'});ui.paragraph(c.away?'The ship is covering this sailor’s duties until the longboat returns.':c.reason||'Following the captain’s directive.',dialogWidth,{size:11});}
}
function nextVoyage(s:any){
 if(s.away)return {text:s.away.choice?'The longboat is on its way home. Review staffing while the party is away.':'The longboat has an encounter. Open Longboat to choose the safe or risky approach.',label:'Check the longboat',run:()=>panel='away'};
 if(s.fire>0||s.leak>20)return {text:'Damage control first. Review the repair watch, or reach a port for full repairs.',label:'Review damage control',run:()=>panel='book'};
 if(!s.missionsDone?.includes('timber')&&!s.mission)return {text:'Start with Wood You Kindly. It pays for a safe first expedition.',label:'Open contracts',run:()=>panel='missions'};
 if(!s.visited?.includes('mossjaw'))return {text:'Sail to Mossjaw Cay. The crew steers and drops anchor for you.',label:'Set course for Mossjaw',run:()=>route('mossjaw')};
 if((s.stats?.expeditions||0)===0)return {text:'At Mossjaw, send two sailors to gather timber. Peg knows the old grove; Pip knows the return route.',label:'Plan an expedition',run:()=>panel='away'};
 if(!s.visited?.includes('saltwick'))return {text:'Return to Saltwick to sell cargo, resupply and fit an upgrade.',label:'Set course for Saltwick',run:()=>route('saltwick')};
 if((s.stats?.trades||0)===0)return {text:'Try the market: spice travels well from Saltwick to Gallows, sailcloth makes the return trip worthwhile.',label:'Open the market',run:()=>panel='trade'};
 return {text:s.mission?'Work toward '+s.mission.title+'. Check its requirements in the contract book.':'Choose another contract, explore the chart, or prepare to hunt a raider.',label:s.mission?'Review contract':'Browse contracts',run:()=>panel='missions'};
}
function logbook(s:any){
 ui.heading('The captain’s record',{size:21});ui.paragraph('Renown '+(s.reputation||0)+' · '+((s.reputation||0)<60?'Unknown to the harbourmaster':(s.reputation||0)<180?'A familiar nuisance':'A name across the Quarrelsome Sea'),dialogWidth,{size:12});
 const next=nextVoyage(s);ui.paragraph(next.text,dialogWidth,{size:12});button(next.label,next.run,true);
 ui.label('CHARTED BY THIS CREW',{color:C.gold,size:10});
 for(const p of places)ui.label((s.visited?.includes(p.id)?'✓ ':'○ ')+p.name,{size:12,color:s.visited?.includes(p.id)?C.green:C.muted});
 ui.label('Expeditions '+(s.stats?.expeditions||0)+' · Captures '+(s.stats?.captures||0)+' · Trades '+(s.stats?.trades||0),{size:12});
 ui.label('MILESTONES',{color:C.gold,size:10});
 const badges:any={chart:'Every destination visited',trader:'First market trade',raider:'First enemy defeated',shore:'Three expeditions returned',fortune:'1,000 gold in the strongbox'};
 for(const id of Object.keys(badges))ui.label((s.badges?.includes(id)?'✓ ':'○ ')+badges[id],{size:12,color:s.badges?.includes(id)?C.green:C.muted});
 ui.label('VOYAGE JOURNAL',{color:C.gold,size:10});
 for(const entry of s.log.slice().reverse()){ui.label('Day '+(Math.floor(entry.at/240)+1)+' · '+entry.name,{size:10,color:C.gold});ui.paragraph(entry.text,dialogWidth,{size:12});}
}
function crewDialog(s:any){
 const c=s.crew.find((c:any)=>c.id===selectedCrew)||s.crew[0];
 ui.grid('crew picker',()=>{for(let i=0;i<6;i++)button(s.crew[i].name.split(' ')[0],()=>{selectedCrew=s.crew[i].id;updateBrainFields();},c.id===s.crew[i].id);},{columns:dialogWidth<460?3:6,width:dialogWidth,gap:4});
 ui.heading(c.name,{size:24});ui.label(c.role,{color:C.gold});ui.paragraph(c.trait,dialogWidth,{size:13});
 ui.label('LEVEL '+c.level+'   ·   '+Math.floor(c.xp)+' / '+(c.level*35)+' XP   ·   FATIGUE '+Math.round(c.fatigue)+'%',{color:C.gold,size:11});
 ui.grid('crew tabs',()=>{button('Orders & memory',()=>tab='voyage',tab==='voyage');button('Crew ties',()=>tab='ties',tab==='ties');button('Individual brain',()=>tab='brain',tab==='brain');},{columns:dialogWidth<380?1:3,width:dialogWidth,gap:6});
 if(tab==='brain'){
  ui.paragraph('Browser brains share one tiny model while keeping each character’s personality, preferences and learned orders separate.',dialogWidth,{size:12});
  brainMode=ui.select('Decision provider',brainMode,['Tiny CPU default · in browser','My OpenAI-compatible endpoint']);
  if(brainMode){endpoint=ui.textField('Endpoint base URL',endpoint,{width:dialogWidth,maxChars:240});model=ui.textField('Model ID',model,{width:dialogWidth,maxChars:100});apiKeyEnv=ui.textField('API key environment variable (optional)',apiKeyEnv,{width:dialogWidth,maxChars:60});ui.paragraph('External endpoints use the optional companion officer. Export after saving.',dialogWidth,{size:11});}
  else{brainLoadControl();ui.paragraph(browserBrain.status,dialogWidth,{size:11});button('Retry model loading',()=>browserBrain.retry());}
  ui.column('brain save',()=>{button('Save this character',saveBrain,true);button('Export brain configuration',exportBrains);button('Setup help',()=>panel='brains');});
  ui.label('DECISION JSON ONLY · NO MODEL-GENERATED DIALOGUE',{size:10,color:C.gold});
  ui.paragraph('Current source: '+(c.brain==='browser LLM'?'validated browser LLM decision':c.brain==='local LLM'?'validated companion LLM decision':'built-in instinct')+'. Instincts fill gaps while the model loads or thinks.',dialogWidth,{size:11});
 }else if(tab==='ties'){
  meter('Trust in the captain',c.trust??50,100,C.gold,dialogWidth);
  ui.paragraph('Praise builds trust. Correcting a habit is a small setback; medical care builds confidence. Shared expeditions and boarding actions change bonds between sailors.',dialogWidth,{size:12});
  for(const other of s.crew.filter((x:any)=>x.id!==c.id)){const bond=c.bonds?.[other.id]??50;ui.paragraph(other.name+' · '+Math.round(bond)+' / 100 · '+(bond>=65?'trusted shipmate':bond<40?'strained waters':'getting acquainted'),dialogWidth,{size:12});}
  ui.label('STORIES THEY SHARE',{color:C.gold,size:10});for(const story of c.stories||[])ui.paragraph(story,dialogWidth,{size:12});if(!c.stories?.length)ui.paragraph('Their first shared adventure is still ahead. Send them ashore together to start a story.',dialogWidth,{size:12});
  ui.paragraph('A strong bond adds 5 percentage points to an expedition’s risky approach. Exhaustion and existing injuries reduce the chance. The longboat shows the final odds.',dialogWidth,{size:11});
 }else{
  issuer=ui.select('Order through',issuer,['Captain Mara Morrow','First mate Barnaby Brisk']);override=ui.checkbox('Emergency off-role warrant',override);
  ui.label('Ordinary duties: '+c.ordinary.map((t:string)=>taskNames[t]).join(' · '),{size:11,color:C.muted});
  ui.grid('Task choices',()=>{for(const t of ['helm','lookout','guns','repair','cook','forage','rest'])button(taskNames[t],()=>doOrder(t),c.task===t);},{columns:dialogWidth<380?2:4,width:dialogWidth,gap:6});button('Good work. Remember that.',()=>command({type:'praise',crewId:c.id}));
  ui.paragraph(c.reason||'Following the standing directive.',dialogWidth,{size:12});
  if(c.injury>0)ui.paragraph('Injury '+Math.ceil(c.injury)+'% · rest heals gradually; a port doctor treats the crew for 40 gold.',dialogWidth,{size:11});
  const preferred=['auto',...c.ordinary];const chosen=ui.select('Preferred duty',Math.max(0,preferred.indexOf(c.preferred||'auto')),preferred.map(t=>t==='auto'?'Let the crew decide':taskNames[t]));if(preferred[chosen]!== (c.preferred||'auto'))command({type:'habit',crewId:c.id,action:'prefer',task:preferred[chosen]});
  button('Less of this in this situation',()=>command({type:'habit',crewId:c.id,action:'discourage'}));
  ui.label('LEARNED FROM YOU',{color:C.gold,size:10,weight:'bold'});
  if(!c.memories.length)ui.paragraph('No orders remembered yet. Direct commands build bounded task preferences; praise reinforces the current choice.',dialogWidth,{size:12});else{for(const m of c.memories.slice(-3))ui.label('↳ '+m.text+'  ['+m.directive+']',{size:11});}
  const prefs=Object.keys(c.preferences).map(k=>taskNames[k]+' +'+c.preferences[k].toFixed(1));if(prefs.length)ui.paragraph('Habits: '+prefs.join(' · '),dialogWidth,{size:11});for(const t of Object.keys(c.preferences))button('Forget habit: '+taskNames[t],()=>command({type:'habit',crewId:c.id,action:'forget',task:t}));ui.paragraph('Praise and correction also build separate habits for each directive and danger level. Preferred duty is a nudge; urgent work and captain orders take priority.',dialogWidth,{size:11});
  ui.paragraph('Captain → First mate → specialists. Officer warrants work only when low hull, hunger or a nearby hostile makes the situation urgent. A direct order lasts 35 seconds.',dialogWidth,{size:11});
 }
}
function worldDialog(){
 ui.paragraph('Local practice is playable now. Online worlds use the same server rules through StarHermit sessions, with one ship for every captain. Empty worlds pause under StarHermit’s recovery policy.',dialogWidth,{size:12});
 if(online&&!state.featureVersion)ui.paragraph('This sea was created with earlier rules. Create a new persistent sea to use the expanded chart, markets and crew systems.',dialogWidth,{size:12});
 ui.grid('Captain’s hub',()=>{button('Contracts',()=>panel='missions');button('Sea atlas',()=>panel='atlas');button('Captain’s log',()=>panel='logbook');button('Standing orders & watch',()=>panel='book');},{columns:dialogWidth<430?1:2,width:dialogWidth,gap:6});
 ui.label(online?'CONNECTED TO STARHERMIT':'PLAYING LOCAL PRACTICE',{color:C.gold,size:10});
 if(!platform.player()){
  ui.paragraph('You are playing as a guest. Sign in with StarHermit to create a persistent sea, invite other captains and return to saved online sessions.',dialogWidth,{size:12});
  button('StarHermit account',()=>{platform.requestSignIn().catch(e=>flash(String(e)));});
 }else{
  ui.label('Signed in: '+platform.player()!.displayName,{size:12});worldName=ui.textField('New sea name',worldName,{width:dialogWidth,maxChars:60});worldPublic=ui.checkbox('List this sea publicly',worldPublic);ui.paragraph(worldPublic?'Any signed-in captain can find the sea in the public list.':'A private sea can be joined with its invitation code.',dialogWidth,{size:11});ui.row('online actions',()=>{button('Create persistent sea',makeWorld,true);button('Refresh worlds',listWorlds);});button('Join an open sea',joinOpenWorld);
  joinCode=ui.textField('World join code',joinCode,{width:Math.min(300,dialogWidth),maxChars:8});button('Join by code',joinWorld);
  if(activeSession)ui.label('Session: '+activeSession,{font:'monospace',size:10,color:C.muted});
  if(room){ui.label('WORLD CODE: '+(room.joinCode||'Starting…'),{color:C.gold});ui.paragraph((room.name||'Persistent sea')+' · '+room.participants.length+' / '+room.seatsPerTeam+' captains',dialogWidth,{size:11});}
  for(const s of sessionList.slice(0,4))button('Resume '+s.sessionId.slice(0,12)+'…',()=>connect(s.sessionId));
  for(const r of roomsList.slice(0,3))ui.label((r.name||'Open sea')+' · '+r.freeSeats+' free berths',{size:11});
 }
 ui.label('LOCAL BRAIN OFFICER',{color:C.gold,size:10});delegate=ui.textField('Authorised companion participant user ID',delegate,{width:dialogWidth,maxChars:80});
 ui.row('delegate',()=>{button('Authorise crew decisions',()=>command({type:'delegate',userId:delegate}));button('Brain setup',()=>panel='brains');});
 ui.row('practice actions',()=>{button('Return to saved practice',local);button('How to sail',()=>panel='help');button('Sound & CPU settings',()=>panel='settings');});
}
function dialogs(){
 const s=state?.myShip;if(!s)return;
 const titles:any={atlas:'The wider Quarrelsome Sea',settings:'Options & performance',book:'The captain’s orders book',logbook:'Tales of the Quarrelsome Sea',combat:'Choose a ship to pick on',crew:'Crew manifest',missions:'Contracts & rumours',away:'Launch the longboat',trade:'A little honest commerce',yard:'The shipwright’s ledger',world:'A sea worth coming back to',brains:'Your crew, your models',help:'Welcome aboard, Captain',more:'The captain’s toolkit'};
 if(!panel)return;
 const f=frame(),sc=ui.preferences().scale;
 const open=ui.style({width:dialogWidth+56}).dialog('Game panel',titles[panel]||'',true,()=>ui.scrollArea('Panel contents',{width:dialogWidth+12,height:Math.max(170,Math.min(650,f.height/sc-180))},()=>{
  if(panel==='crew')crewDialog(s);
  if(panel==='world')worldDialog();
  if(panel==='atlas'){ui.paragraph('Four trading ports, four islands and one extremely crooked wreck. Wind affects speed at the manual helm. Choose a destination for an automatic course.',dialogWidth,{size:12});ui.grid('Atlas destinations',()=>{for(const p of places)ui.style('card').column('atlas-'+p.id,()=>{ui.paragraph(p.name,dialogWidth<430?dialogWidth-24:(dialogWidth-58)/2,{size:16,weight:'bold'});ui.label(Math.round(distanceTo(s,p)*METRES)+' m · '+p.kind,{size:11});button('Sail to '+p.name,()=>{route(p.id);panel='';});},{spacing:5});},{columns:dialogWidth<430?1:2,width:dialogWidth,gap:10});}
  if(panel==='settings'){wideButton('StarHermit engine options · F1',()=>{panel='';openMenu();},true);ui.paragraph('Graphics, frame rate, display, sound volume and accessibility are in engine options. Browser brain CPU limits are below.',dialogWidth,{size:12});const effects=ui.checkbox('Sound effects',effectsOn),sea=ui.checkbox('Quiet sea ambience',seaOn);if(effects!==effectsOn||sea!==seaOn){effectsOn=effects;seaOn=sea;storage.setJson('sound-effects',effectsOn);storage.setJson('sea-ambience',seaOn);soundSettings(effectsOn,seaOn);}ui.paragraph('Cannon rumbles, warning bells and reward chimes use the engine’s volume controls. Sea ambience is optional and quiet.',dialogWidth,{size:12});brainLoadControl();button('Browser brain details',()=>panel='brains');}
  if(panel==='book')ordersBook(s);
  if(panel==='logbook')logbook(s);
  if(panel==='missions'){
   if(s.mission){const def=state.contracts?.[s.mission.id];ui.heading(s.mission.title);ui.paragraph((def?.desc||'Fulfil this contract.')+(s.mission.destination?' Destination: '+places.find(p=>p.id===s.mission.destination)?.name+'.':'')+' Reward: '+s.mission.reward+' gold.',dialogWidth,{size:13});button('Abandon contract',()=>command({type:'abandon'}));}
   else{for(const m of Object.values(state.contracts||{}) as any[]){const done=m.id==='daily'?s.dailyDone?.includes(Math.floor(state.time/240)):s.missionsDone?.includes(m.id);ui.style('card').column(m.id,()=>{ui.paragraph(m.title,dialogWidth-24,{weight:'bold',size:15});ui.label(m.reward+' GOLD',{size:11});ui.paragraph(m.desc,dialogWidth-24,{size:12});button(done?(m.id==='daily'?'Done today':'Completed'):'Accept contract',()=>command({type:'mission',id:m.id}),false,done);},{width:dialogWidth,spacing:7});}}
  }
  if(panel==='away'){
   const p=landing(s);ui.paragraph(p?'Anchored at '+p.name+'. '+(p.kind==='wreck'?'Choose Salvage wreck.':'Choose Chop timber; Peg and Pip make a good timber party.')+' Select two fit sailors, then lower the longboat. They row ashore, work and bring the haul back automatically.':'Anchor within 70 m of an island or wreck before launching.',dialogWidth,{size:12});if(!p&&!s.away){wideButton('Sail to Mossjaw Cay',()=>{route('mossjaw');panel='';},true);}
   if(s.away){ui.heading('Longboat away');wideButton('Watch the shore party',()=>{targetZoom=1;deck=0;panel='';});ui.progress(Math.max(0,Math.min(1,1-(s.away.returnAt-state.time)/(s.away.returnAt-s.away.departAt))),dialogWidth);ui.label('Returning in '+Math.max(0,Math.ceil(s.away.returnAt-state.time))+' seconds.');
    if(s.away.encounter){const e=s.away.encounter;ui.heading(e.title,{size:19});ui.paragraph(e.text,dialogWidth,{size:12});ui.paragraph('A '+e.skill.toLowerCase()+' helps with this encounter. Current party success chance: '+Math.round((s.away.successChance||.62)*100)+'%. Bonds help; fatigue and injuries make it harder. Failure can injure a sailor.',dialogWidth,{size:11});if(!s.away.choice){if(state.time>=s.away.encounterAt){wideButton(e.safe,()=>command({type:'expedition-choice',choice:'safe'}),true);wideButton(e.risk,()=>command({type:'expedition-choice',choice:'risk'}));}else ui.label('Reaching the shore in '+Math.ceil(s.away.encounterAt-state.time)+' seconds.',{size:11});ui.paragraph('If you leave it to the crew, they take the safe haul and return on schedule.',dialogWidth,{size:11});}else ui.label(s.away.choice==='risk'?'Risky approach chosen · return delayed 8s':'Safe approach chosen',{color:C.gold,size:12});}
   }
   else{job=ui.select('Expedition',job,['Chop timber · 25–45 wood','Seek treasure · 75 safe, up to 200 risky','Salvage wreck · shot and timber']);for(const c of s.crew.filter((c:any)=>c.rank>0)){const checked=ui.checkbox(c.name+' · '+c.role+(c.injury>0?' · injured '+Math.ceil(c.injury)+'%':''),party.includes(c.id));if(checked&&!party.includes(c.id))party.push(c.id);if(!checked&&party.includes(c.id))party=party.filter(id=>id!==c.id);}if(p?.kind==='wreck')ui.paragraph('Wrecks support salvage. Choose an island for timber or treasure.',dialogWidth,{size:11});ui.label(party.length+' / 2 selected',{color:party.length===2?C.green:C.red,size:11});button('Lower the longboat',()=>{command({type:'away',job:['timber','treasure','salvage'][job],crewIds:party});targetZoom=1;deck=0;},true,party.length!==2||!p||party.some(id=>s.crew.find((c:any)=>c.id===id)?.injury>40)||job===2&&p.kind!=='wreck'||job!==2&&p.kind==='wreck');}
  }
  if(panel==='trade'){
   const p=portNear(s),ready=!!p&&s.anchored,prices=state.prices?.find((x:any)=>x.id===p?.id)?.goods;
   ui.paragraph(ready?'Trading at '+p.name+'. Harbour guns protect anchored ships. Merchants replenish five crates of each cargo every minute. Prices react to scarcity after the first sea day.':'Sail to Saltwick or Gallows Reach and anchor to trade.',dialogWidth,{size:12});
   ui.label('Purse: '+Math.floor(s.gold)+' gold · Hold '+cargoTotal(s)+' / '+cargoLimit(s),{color:C.gold});
   for(const id of Object.keys(state.goods||{})){const def=state.goods[id],amount=id==='spice'?s.cargo:s.goods?.[id]||0,price=prices?.[id];ui.heading(def.name,{size:17});ui.label('Aboard '+amount+' · Port stock '+(state.markets?.[p?.id]?.[id]??'—'),{size:11});ui.grid('market-'+id,()=>{button('Buy 5 '+def.name.toLowerCase()+' · '+(price?price.buy*5:'—')+' gold',()=>command({type:'trade',item:'buy',good:id}),false,!ready);button('Sell '+amount+' '+def.name.toLowerCase()+' · '+(price?price.sell*amount:'—')+' gold',()=>command({type:'trade',item:'sell',good:id}),false,!ready||amount===0);},{columns:dialogWidth<430?1:2,width:dialogWidth,gap:6});}
   button('Resupply & quick patch · 65 gold',()=>command({type:'trade',item:'supplies'}),true,!ready);
   button('Port doctor · 40 gold',()=>command({type:'service',service:'doctor'}),false,!ready);
   const repairCost=Math.max(10,Math.ceil((s.maxHull-s.hull)*.7+(s.fire||0)+(s.leak||0)+(s.rigDamage||0)*.5));
   button('Full repairs & damage control · '+repairCost+' gold',()=>command({type:'service',service:'repairs'}),false,!ready);
   ui.paragraph('Spice and medicine sell well at Gallows Reach. Sailcloth makes a useful return cargo to Saltwick. Port services tend injuries, refill stores, or extinguish fires and dry the bilge.',dialogWidth,{size:12});
  }
  if(panel==='combat'){
   ui.paragraph('Round shot breaks hulls. Chain shot slows a ship. Grape shot improves boarding odds. Every salvo costs 2 shot and takes 7 seconds to reload.',dialogWidth,{size:12});
   ui.label('Helm: '+(s.controlMode==='manual'?'manual':'charted courses')+' · Wind '+compass(bearing((state.wind||0)+Math.PI))+' '+(state.windKnots||windSpeed(state.time,state.weather!=='Fair winds'))+' kn',{size:12,color:C.gold});
   button(s.controlMode==='manual'?'Return to charted courses':'Take the manual helm · H',()=>command({type:'helm-mode',mode:s.controlMode==='manual'?'course':'manual'}));
   if(s.controlMode==='manual'){ui.paragraph('Hold W / Up to make way; A / Left and D / Right steer while moving. The touch controls work while held. Turn your flank toward a target before firing; the bow and stern cannot fire broadsides.',dialogWidth,{size:12});helmControls();}
   ammoType=ui.select('Ammunition',ammoType,['Round shot · hull damage','Chain shot · slow the rigging','Grape shot · suppress boarders']);
   for(const target of state.raiders.concat(state.ships.filter((t:any)=>t.id!==me))){ui.column('target-'+target.id,()=>{wideButton(target.name,()=>selectedEnemy=target.id,selectedEnemy===target.id);ui.label(Math.round(distanceTo(s,target)*METRES)+' m · hull '+Math.round(target.hull)+' / '+target.maxHull,{size:11});},{spacing:3});}
   button('Close with selected target',()=>command({type:'pursue',target:selectedEnemy}));button('Fire at selected ship',()=>command({type:'fire',target:selectedEnemy,ammunition:['round','chain','grape'][ammoType]}),true);
   if(s.boarding){ui.paragraph('Boarders return in '+Math.max(0,Math.ceil(s.boarding.finishAt-state.time))+' seconds. Success chance '+Math.round(s.boarding.chance*100)+'%.',dialogWidth,{size:12});}
   else{ui.heading('Board a weakened raider',{size:18});ui.paragraph('Close within 70 m after reducing a raider below 45% hull. Keep the captain aboard and send two fit sailors. Brisk or Fuse improves the chance; grape shot helps. Boarding takes 12 seconds and can cause injuries. Success takes a 200 gold prize.',dialogWidth,{size:12});for(const c of s.crew.filter((c:any)=>c.rank>0)){const selected=ui.checkbox('Boarder: '+c.name,party.includes(c.id));if(selected&&!party.includes(c.id))party.push(c.id);if(!selected&&party.includes(c.id))party=party.filter(id=>id!==c.id);}ui.label(party.length+' / 2 boarders selected',{size:11});button('Grapples away',()=>command({type:'board',target:selectedEnemy,crewIds:party}),false,party.length!==2);}
  }
  if(panel==='yard'){
   const ready=!!portNear(s)&&s.anchored;
   ui.paragraph('Fit equipment at either port. Each fitting has three levels; later levels cost more. Ship experience still improves hull strength.',dialogWidth,{size:12});
   if(!shipNameDraft)shipNameDraft=s.name;shipNameDraft=ui.textField('Ship name',shipNameDraft,{width:dialogWidth,maxChars:40});button('Rechristen this ship',()=>command({type:'rename',name:shipNameDraft}));
   ui.label('Ship Lv '+s.level+' · '+Math.floor(s.gold)+' gold',{color:C.gold});meter('Hull',s.hull,s.maxHull,C.green,dialogWidth);
   const effects:any={hull:'+25 hull and full repair',sails:'+10% sailing speed',guns:'+4 broadside damage',hold:'+15 cargo capacity',berths:'Faster rest and injury recovery',pump:'Faster bilge repairs and less flooding damage'};
   for(const id of Object.keys(state.fittings||{})){const def=state.fittings[id],level=s.upgrades?.[id]||0;ui.heading(def.name+' · '+level+' / '+def.max,{size:17});ui.paragraph(effects[id],dialogWidth,{size:12});button(level>=def.max?'Fully fitted':'Fit '+def.name.toLowerCase()+' · '+def.cost*(level+1)+' gold',()=>command({type:'upgrade',fitting:id}),false,!ready||level>=def.max);}
  }
  if(panel==='brains'){
   ui.paragraph('The default SmolLM2 135M brain runs entirely in your browser on CPU. Its 138 MB quantized model downloads once and is cached when browser storage permits. Your crew context stays on this device. No localhost service, Python or extra account is needed.',dialogWidth,{size:12});
   brainLoadControl();ui.paragraph(browserBrain.status,dialogWidth,{size:12});
   ui.paragraph('Low load is the default. Decisions arrive slowly to leave CPU time for other work. Crew instincts keep the ship running between decisions. Each character keeps its own memories and preferences.',dialogWidth,{size:12});
   ui.paragraph('For your own OpenAI-compatible endpoint, choose it under Individual brain and use the optional Python companion with a separate authorised participant account.',dialogWidth,{size:12});
   ui.column('brain setup',()=>{button('Export per-character config',exportBrains,true);button('Configure a character',()=>{panel='crew';tab='brain';updateBrainFields();});});
   ui.paragraph('Decision-only v0.1: JSON task choices. Pirate shouts are authored game lines. The default instinct scheduler keeps the game playable when a model is absent, slow or invalid.',dialogWidth,{size:11});
  }
  if(panel==='more'){for(const [label,id] of [['Sea atlas','atlas'],['Sound & CPU settings','settings'],['Captain’s log','logbook'],['Contracts','missions'],['Combat targets','combat'],['Shipyard','yard'],['Standing orders & watch','book'],['How to sail','help']])button(label,()=>panel=id);}
  if(panel==='help'){
   const next=nextVoyage(s);ui.heading('Your next good idea',{size:19});ui.paragraph(next.text,dialogWidth,{size:13});button(next.label,next.run,true);
   for(const text of ['1  Pick an island or port and set course. The crew sails for you.','2  Set a standing directive; crew choose tasks from their roles.','3  Give direct orders or praise good work to teach task preferences.','4  Zoom in with E to inspect three decks. Q returns to the sea.','5  Anchor at islands and send two crew on a longboat expedition.','6  Trade spice between ports, fulfil contracts and level up.','7  Assign Little Fuse to Guns, close to 170 m and fire with F.','8  H takes the manual helm. Hold W with A / D to steer; show your flank for a broadside.','9  Crew ties and the orders book explain habits, trust and useful partnerships.','10  Visit the shipyard and treat injuries at a port. Watch fire, bilge and rigging damage.'])ui.paragraph(text,dialogWidth,{size:13});
   ui.paragraph('Instincts run immediately. Browser brains are optional, decision-only and validated by the authority. Progress in local practice is saved on this device.',dialogWidth,{size:11});
  }
  ui.row('close panel',()=>{ui.spacer();button('Back to the sea',()=>panel='',true);},{width:dialogWidth});
 }));if(!open)panel='';
}
onRender(()=>{
 touchTurn=0;touchThrottle=0;
 const f=frame(),scale=ui.preferences().scale,w=f.width,h=f.height,mobile=w/scale<1000;
 if(w<1||h<1)return;
 renderScene();if(state?.weather!=='Fair winds'&&state){for(let i=0;i<45;i++){const rx=((i*137+elapsed*100)% (w+80))-40,ry=(i*97+elapsed*400)%h;draw.line(rx,ry,rx-8*scale,ry+24*scale,'#c8dfdf55',1);}}header(w,scale,mobile);toolbar(w,scale,mobile);
 const lw=w/scale,lh=h/scale;dialogWidth=Math.max(200,Math.min(530,lw-80));
 if(!mobile){navPanel(20,144,230,lh-330,scale);ordersPanel(lw-297,144,277,lh-330,scale);}
 else if(mobilePanel)ordersPanel(12,lw<420?240:192,lw-24,lh-(lw<420?240:192)-168,scale);
 if(state?.myShip){
  if(mobile){ui.area({x:12*scale,y:137*scale,width:(lw-24)*scale,height:(lw<420?85:48)*scale},()=>ui.grid('Mobile actions',()=>{button('Course',()=>panel='atlas');button('Crew',()=>openCrew(selectedCrew));button('Longboat',openLongboat);button('Trade',()=>panel='trade');button('More',()=>panel='more');if(targetZoom>.5)button(['Weather deck','Gun deck','Cargo hold'][deck],()=>{deck=(deck+1)%3;});},{columns:lw<420?3:6,width:lw-24,gap:5}));}

 }
 instruments(w,h,scale,mobile);bottom(w,h,scale,mobile);
 dialogs();
 if(noticeTime>0){const width=Math.min(520,lw-24),x=(w-width*scale)/2,y=h-84*scale;draw.box(x,y,width*scale,72*scale,'toast');ui.area({x:x+12*scale,y:y+10*scale,width:(width-24)*scale,height:55*scale},()=>ui.style({text:{color:C.ink}}).paragraph(notice,width-24,{size:12}));}
 // Model providers never receive platform tokens or authority handles.
});
