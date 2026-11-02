import {scene,Color,Mesh,InstancedMesh,Group,BoxGeometry,CylinderGeometry,SphereGeometry,PlaneGeometry,TorusGeometry,RingGeometry,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,MeshBasicMaterial,Vector3,Vector4,Matrix4,DoubleSide,PointLight} from 'starhermit:scene';
import {METRES,SHIP_SCALE} from './navigation.js';
import {Cloth} from './cloth.js';

// Editable, shared game geometry keeps decks, crew and rigging interactive.
const cube=new BoxGeometry(1,1,1),ball=new SphereGeometry(1,12,9),pole=new CylinderGeometry(1,1,1,8),torus=new TorusGeometry(1,.10,5,20);
const palette:any={};
export function mat(color:string,roughness=.82){if(!palette[color])palette[color]=new MeshStandardMaterial({color,roughness,metalness:['#bda262','#ccad67','#b99b57'].includes(color)?.58:.02});return palette[color];}
export function mesh(g:any,geometry:any,material:any,x=0,y=0,z=0){const m=new Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
export function box(g:any,x:number,y:number,z:number,w:number,h:number,d:number,color:string){const m=mesh(g,cube,mat(color),x,y,z);m.scale.set(w,h,d);return m;}
export function sphere(g:any,x:number,y:number,z:number,r:number,color:string){const m=mesh(g,ball,mat(color),x,y,z);m.scale.set(r,r,r);return m;}
const cylinders:any={};
export function cylinder(g:any,x:number,y:number,z:number,rt:number,rb:number,h:number,color:string,n=10){const ratio=rt/Math.max(.0001,rb),key=ratio.toFixed(3)+':'+n;if(!cylinders[key])cylinders[key]=new CylinderGeometry(ratio,1,1,n);const m=mesh(g,cylinders[key],mat(color),x,y,z);m.scale.set(rb,h,rb);return m;}
export function beam(g:any,a:number[],b:number[],r:number,color:string){const dir=new Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),m=mesh(g,pole,mat(color),(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);m.scale.set(r,dir.length(),r);m.quaternion.setFromUnitVectors(new Vector3(0,1,0),dir.normalize());return m;}
export function ring(g:any,x:number,y:number,z:number,r:number,color:string){const m=mesh(g,torus,mat(color),x,y,z);m.scale.set(r,r,r);return m;}
export function geometry(vertices:number[],indices:number[],uv?:number[]){const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(vertices,3));geo.setIndex(indices);if(uv)geo.setAttribute('uv',new Float32BufferAttribute(uv,2));geo.computeVertexNormals();return geo;}
export function batchStatic(g:any){
 g.updateMatrixWorld(true);const inverse=new Matrix4().copy(g.matrixWorld).invert(),batches:any[]=[];
 g.traverse((child:any)=>{if(!(child instanceof Mesh)||child instanceof InstancedMesh||child.userData.animated)return;let b=batches.find(b=>b.geo===child.geometry&&b.mat===child.material);if(!b){b={geo:child.geometry,mat:child.material,items:[]};batches.push(b);}b.items.push(child);});
 for(const b of batches){if(b.items.length<2)continue;const inst=new InstancedMesh(b.geo,b.mat,b.items.length);inst.castShadow=true;inst.receiveShadow=true;for(let i=0;i<b.items.length;i++){inst.setMatrixAt(i,new Matrix4().multiplyMatrices(inverse,b.items[i].matrixWorld));b.items[i].parent.remove(b.items[i]);}inst.instanceMatrix.needsUpdate=true;g.add(inst);}
}
export function barrel(g:any,x:number,y:number,z:number,r=.29){cylinder(g,x,y+.32,z,r*.85,r,.64,'#86603c');cylinder(g,x,y+.32,z,r,r*.85,.34,'#a97b48');for(const dy of [.08,.52]){const band=ring(g,x,y+dy,z,r*.98,'#354442');band.rotation.x=Math.PI/2;}cylinder(g,x,y+.65,z,r*.85,r*.85,.025,'#bd955e');box(g,x,y+.67,z,r*1.4,.015,.025,'#715337');}
export function crate(g:any,x:number,y:number,z:number,size=.6){box(g,x,y+size/2,z,size,size,size,'#b48b55');for(const dx of [-.25,.25])box(g,x+dx*size/.6,y+size/2,z+size*.51,.07,size+.04,.025,'#ddba78');for(const dy of [.08,size-.08])box(g,x,y+dy,z+size*.52,size+.02,.07,.03,'#ddba78');const brace=box(g,x,y+size/2,z+size*.54,.065,size*1.2,.03,'#e4c68c');brace.rotation.z=.65;}
export function lantern(g:any,x:number,y:number,z:number){box(g,x,y,z,.15,.26,.15,'#233e40');const glow=mesh(g,ball,new MeshStandardMaterial({color:'#ffd595',emissive:'#ffc36e',emissiveIntensity:1.8}),x,y,z);glow.scale.set(.066,.10,.066);for(const dy of [-.15,.15])box(g,x,y+dy,z,.19,.035,.19,'#bda262');ring(g,x,y+.23,z,.065,'#bda262');}
function cannon(g:any,x:number,y:number,z:number,side:number){box(g,x,y+.08,z,.4,.16,.47,'#a86d46');for(const dz of [-.16,.16])for(const dx of [-.18,.18]){const wheel=cylinder(g,x+dx,y,z+dz,.075,.075,.055,'#382f27');wheel.rotation.z=Math.PI/2;}
 const barrel=cylinder(g,x+side*.15,y+.23,z,.09,.14,.7,'#263b3b',12);barrel.rotation.z=-side*Math.PI/2;const mouth=cylinder(g,x+side*.52,y+.23,z,.067,.067,.012,'#111f24');mouth.rotation.z=Math.PI/2;ring(g,x-side*.22,y+.23,z,.10,'#b99b57').rotation.y=Math.PI/2;
}
const widths=[[-4.05,.66],[-3.6,1.12],[-2.7,1.53],[-1.5,1.64],[0,1.65],[1.6,1.5],[2.8,1.12],[3.8,.48],[4.35,.025]];
function widthAt(z:number){for(let i=1;i<widths.length;i++)if(z<=widths[i][0]){const a=widths[i-1],b=widths[i],t=(z-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t;}return .025;}
export function boatHull(g:any,enemy=false){const belts:any[]=[];
 const colors=enemy?['#272e30','#42352d','#775039','#9b6d43','#493f31']:['#203f3d','#315450','#6e4a31','#9f7248','#4b382a'];
 for(let belt=0;belt<5;belt++){
  const v:number[]=[],ind:number[]=[];
  for(const side of [-1,1])for(let i=0;i<widths.length-1;i++){
   const n=v.length/3;
   for(const [section,t] of [[i,belt/5],[i+1,belt/5],[i+1,(belt+1)/5],[i,(belt+1)/5]]){const [z,w]=widths[section],keel=-1.55+Math.pow(Math.abs(z)/4.4,3)*.7,sheer=1.22+Math.pow(Math.abs(z)/4.4,4)*.28;v.push(side*w*(.30+.70*Math.sin(t*Math.PI/2)),keel+(sheer-keel)*t,z);}
   if(side>0)ind.push(n,n+2,n+1,n,n+3,n+2);else ind.push(n,n+1,n+2,n,n+2,n+3);
  }
  const beltMat=new MeshStandardMaterial({color:colors[belt],roughness:.78,side:DoubleSide});belts.push(beltMat);mesh(g,geometry(v,ind),beltMat);
 }
 for(let j=0;j<32;j++){const z=-3.83+j*.25,w=widthAt(z)-.1;box(g,0,1.25,z,Math.max(.08,w*2),.10,.238,j%4===0?'#b89562':j%4===1?'#d1ae73':'#c6a16b');if(j%3===0)for(const side of [-1,1])sphere(g,side*Math.max(.02,w-.1),1.307,z,.018,'#70573c');}
 for(const side of [-1,1]){
  for(let i=0;i<widths.length-1;i++){const a=widths[i],b=widths[i+1];for(const y of [1.04,1.47])beam(g,[side*a[1],y,a[0]],[side*b[1],y,b[0]],y>1.1?.047:.055,y>1.1?'#ccad67':'#263f3c');}
  for(let z=-3.5;z<3.6;z+=.55)box(g,side*widthAt(z),1.38,z,.06,.45,.065,'#bfa36d');
 }
 box(g,0,.9,-4.04,1.3,.55,.12,'#294743');for(const x of [-.43,0,.43])box(g,x,.92,-4.115,.20,.27,.035,'#e6bc74');
 return belts;
}
// Crew-designed patterns (data-only mods). pattern/emblem are enum codes from the
// authority's tables; the accent colour comes from its fixed palette.
const PATTERN_WGSL=`fn modMask(u: vec2f) -> f32 { let p=uniforms.pattern; var m=0.0;
 if(p>0.5&&p<1.5){m=step(0.5,fract(u.x*4.0));}
 else if(p>1.5&&p<2.5){m=step(abs(fract(u.y*2.2+abs(u.x-0.5)*2.4)-0.5),0.2);}
 else if(p>2.5&&p<3.5){m=select(0.0,1.0,(u.x>0.5)!=(u.y>0.5));}
 else if(p>3.5&&p<4.5){m=step(0.78,fract(sin(floor(u.x*6.0)*12.9898+floor(u.y*5.0)*78.233)*43758.5453));}
 else if(p>4.5&&p<5.5){m=step(0.5,u.x);}
 else if(p>5.5&&p<6.5){m=1.0-step(0.12,min(min(u.x,1.0-u.x),min(u.y,1.0-u.y)));}
 let e=uniforms.emblem; if(e>0.5){ let d=(u-vec2f(0.5,0.48))*vec2f(1.0,1.25); let r=length(d); let a=atan2(d.y,d.x); var k=0.0;
  if(e<1.5){k=(1.0-step(0.16,r))*step(0.045,length(d-vec2f(-0.06,0.03)))*step(0.045,length(d-vec2f(0.06,0.03)));}
  else if(e<2.5){k=1.0-step(0.09+0.08*pow(abs(cos(a*2.5)),3.0),r);}
  else if(e<3.5){k=step(0.13,r)*(1.0-step(0.17,r))+(1.0-step(0.17,r))*(1.0-step(0.02,min(abs(d.x),abs(d.y))));}
  else if(e<4.5){k=(1.0-step(0.025,abs(d.x)))*(1.0-step(0.17,abs(d.y)))+step(0.11,r)*(1.0-step(0.15,r))*step(0.0,-d.y);}
  else if(e<5.5){k=1.0-step(0.08+0.06*abs(sin(a*4.0+r*20.0)),r);}
  else if(e<6.5){k=(1.0-step(0.08,r))+(1.0-step(0.16,r))*step(0.6,abs(cos(a*6.0)));}
  else {k=(1.0-step(0.15,r))*step(0.13,length(d-vec2f(0.06,0.03)));}
  m=select(m,1.0-m,k>0.5); if(p<0.5){m=step(0.5,k);} }
 return clamp(m,0.0,1.0); }`;
function modUniforms(){return {pattern:{value:0},emblem:{value:0},ar:{value:0},ag:{value:0},ab:{value:0}};}
const ACCENT=`let accent=vec3f(uniforms.ar,uniforms.ag,uniforms.ab); let mm=modMask(s.uv);`;
function canvas(g:any,w:number,h:number,z:number,y:number,color:string){const v:number[]=[],ind:number[]=[],uv:number[]=[];const nx=9,ny=6;
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const u=i/nx,t=j/ny,edge=Math.sin(t*Math.PI);v.push((u-.5)*w*(1-.13*t),y-t*h+.12*Math.cos(u*Math.PI*2)*t,z+Math.sin(u*Math.PI)*edge*.42);uv.push(u,t);}
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;ind.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
 const material=new MeshStandardMaterial({color,roughness:.94,side:DoubleSide,hooks:{uniforms:{furl:{value:1},top:{value:y},mast:{value:z},...modUniforms()},vertex:`fn vertex(v: Vertex) -> Vertex {var o=v;let f=uniforms.furl;o.position.y=uniforms.top-(uniforms.top-v.position.y)*f;o.position.z=uniforms.mast+(v.position.z-uniforms.mast)*f;o.position.x=v.position.x*(0.86+0.14*f);return o;}`,surface:PATTERN_WGSL+`
fn surface(s: Surface) -> Surface { var o=s; ${ACCENT} let seam=1.0-smoothstep(0.018,0.034,abs(fract(s.uv.x*7.0)-0.5)); let weave=sin(s.uv.x*420.0)*sin(s.uv.y*350.0)*0.025; o.base_color=vec4f(mix(s.base_color.rgb,accent,mm)*(0.94+weave-seam*0.12),s.base_color.a); return o; }`}});
 const cloth=mesh(g,geometry(v,ind,uv),material);cloth.userData.animated=true;cloth.castShadow=false;
 // Head lashed to the yard, both clews sheeted home; the rest is free canvas.
 cloth.userData.cloth=new Cloth(cloth,nx,ny,(i,j)=>j===0||(j===ny&&(i===0||i===nx)));return cloth;
}
export function crewDoll(color:string,index:number){
 const g=new Group(),skin=['#eac29a','#cb9974','#e7ba87','#d9ad87','#b87f5b','#eac7a0'][index%6],uniform:any[]=[],limbs:any[]=[];
 const body=cylinder(g,0,.44,0,.16,.19,.34,color);uniform.push(body);box(g,0,.49,.115,.24,.28,.06,index===4?'#eee0bb':'#eee2c5');box(g,0,.29,0,.35,.065,.25,'#3b332b');box(g,.04,.29,.143,.09,.065,.02,'#ccad67');
 for(const side of [-1,1]){const leg=new Group();leg.position.set(side*.095,.27,0);cylinder(leg,0,-.10,0,.075,.067,.23,'#35484b');box(leg,0,-.23,.04,.13,.12,.22,'#302d28');if(index===3&&side<0)cylinder(leg,0,-.17,0,.035,.03,.27,'#a8794c');g.add(leg);limbs.push(leg);
  const arm=new Group();arm.position.set(side*.19,.56,0);const sleeve=cylinder(arm,0,-.08,0,.075,.06,.19,color);uniform.push(sleeve);sphere(arm,0,-.22,.02,.061,skin);g.add(arm);limbs.push(arm);}
 cylinder(g,0,.66,0,.066,.067,.10,skin);sphere(g,0,.84,0,.20,skin).scale.set(.18,.21,.17);const hair=sphere(g,0,.94,-.03,.19,index===4?'#dad2bc':index===1?'#a2794e':'#493c2d');hair.scale.set(.19,.09,.17);g.userData.hair=hair;
 sphere(g,0,.83,.171,.048,skin);for(const side of [-1,1]){sphere(g,side*.068,.88,.155,.032,'#f5e8c9');sphere(g,side*.068,.88,.18,.015,'#20313a');box(g,side*.068,.93,.159,.067,.018,.025,'#493a2b');}
 box(g,0,.755,.16,.075,.014,.02,'#8a5b46');if(index===1||index===3){const beard=sphere(g,0,.73,.11,.12,index===3?'#b98350':'#67513b');beard.scale.set(.13,.11,.1);g.userData.beard=beard;}
 if(index<2){const brim=sphere(g,0,1.045,0,.27,'#263b39');brim.scale.set(.30,.045,.23);const crown=sphere(g,0,1.105,-.015,.22,'#263b39');crown.scale.set(.22,.10,.16);for(const side of [-1,1]){const flap=box(g,side*.16,1.09,0,.20,.065,.29,'#293f3c');flap.rotation.z=side*.5;}sphere(g,.09,1.13,.15,.028,'#ccad67');}
 else{const band=cylinder(g,0,1.006,0,.19,.19,.09,color);uniform.push(band);if(index===4){const cap=sphere(g,0,1.12,0,.23,'#f0dfbc');cap.scale.set(.23,.12,.19);}else{const tail=box(g,.17,.96,-.13,.1,.24,.04,color);tail.rotation.z=-.3;uniform.push(tail);}}
 if(index===2){box(g,-.07,.88,.188,.075,.06,.025,'#263b39');beam(g,[-.19,.88,.05],[.15,.96,.1],.012,'#263b39');}if(index===5)for(const side of [-1,1]){const lens=ring(g,side*.075,.89,.18,.059,'#b99b57');lens.scale.z=.5;}
 const tool=new Group();box(tool,.29,.40,.08,.05,.53,.05,'#a77a46');box(tool,.29,.66,.08,.27,.14,.07,'#7e8d84');g.add(tool);tool.visible=false;
 // Behaviour props: a brass telescope at the eye, a cannonball held in both hands, a fishing rod.
 const scope=new Group();scope.position.set(.07,.86,.2);const tube=cylinder(scope,0,0,.14,.034,.042,.32,'#bda262');tube.rotation.x=Math.PI/2;const lens=cylinder(scope,0,0,.3,.046,.046,.05,'#3b332b');lens.rotation.x=Math.PI/2;g.add(scope);scope.visible=false;
 const shot=sphere(g,0,.4,.25,.11,'#2b2f30');shot.visible=false;
 const rod=new Group();rod.position.set(.2,.42,.16);box(rod,0,.42,.38,.025,.025,1.25,'#8a6a3e').rotation.x=-.9;box(rod,0,.95,.86,.006,.9,.006,'#e6e1d1');g.add(rod);rod.visible=false;
 g.userData.uniform=uniform;g.userData.limbs=limbs;g.userData.tool=tool;g.userData.scope=scope;g.userData.shot=shot;g.userData.rod=rod;return g;
}
export function shipModel(enemy=false){
 const g=new Group(),hull=new Group(),rig=new Group(),guns=new Group(),hold=new Group(),section=new Group(),people=new Group(),sails:any[]=[];g.add(hull,rig,guns,hold,section,people);g.scale.set(SHIP_SCALE,SHIP_SCALE,SHIP_SCALE);const belts=boatHull(hull,enemy);
 box(hull,0,1.64,-2.95,2.12,.67,1.35,enemy?'#5b3e35':'#34534c');
 for(const x of [-.72,-.36,0,.36,.72]){box(hull,x,1.72,-3.64,.25,.29,.03,'#d9b76b');box(hull,x,1.72,-3.66,.025,.3,.015,'#765533');}
 for(let i=0;i<8;i++)box(hull,0,2.02,-3.68+i*.19,2.3,.09,.18,i%2?'#895738':'#a06c43');
 for(const x of [-1,1]){lantern(hull,x,1.99,-3.59);beam(hull,[x,1.34,-2.32],[x,1.93,-2.74],.045,'#ccad67');}
 // Wheel, hatch coaming, capstan and neatly coiled ropes.
 box(hull,0,1.52,-1.88,.14,.46,.15,'#775137');const wheel=ring(hull,0,1.85,-1.88,.27,'#ba9560');for(let i=0;i<8;i++){const a=i*Math.PI/4;beam(hull,[0,1.85,-1.88],[Math.cos(a)*.34,1.85+Math.sin(a)*.34,-1.88],.022,'#b5945b');}wheel.rotation.y=0;
 box(hull,.61,1.32,.24,.62,.10,.87,'#493c2d');for(let i=0;i<5;i++)box(hull,.38+i*.115,1.38,.24,.05,.035,.76,'#98774b');
 cylinder(hull,0,1.48,2.75,.12,.18,.42,'#694b32');for(let i=0;i<4;i++){const a=i*Math.PI/2;beam(hull,[0,1.64,2.75],[Math.cos(a)*.45,1.64,2.75+Math.sin(a)*.45],.025,'#bb9861');}
 for(const side of [-1,1])for(let j=0;j<3;j++)cannon(hull,side*1.25,1.39,-1.35+j*1.37,side);
 // The shot garland by the main hatch: where gunners fetch balls from.
 for(let i=0;i<3;i++)for(let k=0;k<3-i;k++)for(let m=0;m<3-i;m++)sphere(hull,-.42+(k-(2-i)/2)*.075,1.37+i*.065,.3+(m-(2-i)/2)*.075,.04,'#2b2f30');box(hull,-.42,1.33,.3,.3,.03,.3,'#6e5034');
 beam(hull,[0,1.3,3.3],[0,2.0,5.25],.065,'#9d7846');for(const side of [-1,1])beam(hull,[side*.7,1.3,3.1],[0,2.0,5.2],.013,'#bca774');
 const flags:any[]=[],emblems:any[]=[];
 for(let j=0;j<2;j++){
  const z=j?-1.65:1.15,top=j?5.9:6.8;beam(rig,[0,1.3,z],[0,top,z],.075,'#88623e');cylinder(rig,0,1.45,z,.15,.17,.20,'#b99b57');
  if(!j){beam(rig,[0,top,z],[0,top+.75,z],.05,'#88623e');cylinder(rig,0,top-.32,z,.36,.36,.05,'#7d5a37',14);for(let q=0;q<10;q++){const a=q/10*Math.PI*2;box(rig,Math.cos(a)*.34,top-.15,z+Math.sin(a)*.34,.12,.32,.035,q%2?'#946a41':'#a97b48').rotation.y=-a+Math.PI/2;}const rim=ring(rig,0,top+.02,z,.35,'#b99b57');rim.rotation.x=Math.PI/2;rim.scale.set(.35,.35,.6);}
  for(const side of [-1,1]){beam(rig,[side*1.45,1.45,z-.65],[0,top-.7,z],.013,'#a39771');beam(rig,[side*1.45,1.45,z+.7],[0,top-.7,z],.013,'#a39771');for(let q=0;q<10;q++){const t=q/10;beam(rig,[side*(1-t)*1.4,1.5+t*(top-2.2),z-.65*(1-t)],[side*(1-t)*1.4,1.5+t*(top-2.2),z+.7*(1-t)],.009,'#aca17d');}}
  for(let level=0;level<2;level++){const y=top-.6-level*1.65,w=(j?2.7:3.9)*(level?.95:.82);beam(rig,[-w/2,y,z],[w/2,y,z],.041,'#9c7848');const sail=canvas(rig,w,level?1.55:1.4,z+.06,y,enemy?'#bd725a':'#efe2bd');sails.push(sail);}
  const flag=mesh(rig,new PlaneGeometry(.93,.43,8,4),new MeshStandardMaterial({color:enemy?'#803c38':'#284640',side:DoubleSide,hooks:{uniforms:modUniforms(),surface:PATTERN_WGSL+`\nfn surface(s: Surface) -> Surface { var o=s; ${ACCENT} o.base_color=vec4f(mix(s.base_color.rgb,accent,mm),s.base_color.a); return o; }`}}),.46,top-.05+(j?0:.7),z);flags.push(flag);flag.userData.animated=true;flag.userData.cloth=new Cloth(flag,8,4,(i)=>i===0,true);
  const emblem=new Group();rig.add(emblem);const fy=top-.05+(j?0:.7);sphere(emblem,.46,fy,z+.025,.11,'#e8d4a3').scale.z=.15;for(const side of [-1,1])sphere(emblem,.46+side*.036,fy+.01,z+.045,.022,'#29423c');emblems.push(emblem);
 }
 for(const y of [1.25,.2,-.8]){box(section,-1.43,y,-.15,.16,.10,6.6,'#d4b276');}
 for(let j=0;j<14;j++)box(section,-1.45,-.1,-3.4+j*.5,.11,2.65,.47,j%2?'#8a643f':'#98764c');box(section,0,-.1,-3.52,2.9,2.65,.10,'#705135');
 for(let i=0;i<10;i++)box(section,-1.13,-.64+i*.2,1.9,.48,.055,.17,'#c2a36c');for(const x of [-1.38,-.89])beam(section,[x,-.7,1.9],[x,1.25,1.9],.025,'#765539');
 for(const [deck,y,color] of [[guns,.2,'#ba9764'],[hold,-.8,'#98774e']] as [Group,number,string][]){for(let j=0;j<28;j++)box(deck,0,y,-3.3+j*.24,2.85,.11,.23,j%3?color:'#b28e59');}
 for(const side of [-1,1])for(let j=0;j<3;j++)cannon(guns,side*1.13,.36,-1.5+j*1.5,side);barrel(guns,0,.28,-2.7,.22);lantern(section,-1.28,.8,-1.0);
 for(let j=0;j<4;j++){crate(hold,-.92,-.74,-2.45+j*1.28,.59);barrel(hold,.94,-.74,-2.2+j*1.22,.27);}for(let i=0;i<3;i++)box(hold,.85,-.05,-1.9+i*.15,.4,.08,.12,'#d3c39c');
 // Ready racks beside the guns: one ball shown per stocked volley (authority's racks).
 const racks:any={port:[],starboard:[]};for(const side of [1,-1])for(let i=0;i<3;i++){const b=sphere(g,side*.98,1.38,.42+i*.1,.045,'#2b2f30');b.userData.animated=true;racks[side>0?'port':'starboard'].push(b);}
 guns.visible=false;hold.visible=false;section.visible=false;const dolls:any[]=[];
 for(let i=0;i<6;i++){const c=crewDoll(['#b25952','#dda854','#7d88a2','#77a891','#c57c9b','#8aadaf'][i],i);c.scale.set(.55,.55,.55);c.position.set((i%2?1:-1)*.65,1.34,-1.6+Math.floor(i/2)*1.5);people.add(c);dolls.push(c);}
 batchStatic(hull);batchStatic(guns);batchStatic(hold);batchStatic(section);
 const flames:any[]=[];for(let i=0;i<4;i++){const f=mesh(g,ball,new MeshBasicMaterial({color:i%2?'#ffd286':'#ed7d3e'}),(i%2?-.8:.8),1.7+i*.2,-1.4+i*.8);f.scale.set(.2,.4,.2);f.visible=false;flames.push(f);}
 const wake=mesh(g,new RingGeometry(.65,1,32,1,Math.PI*.12,Math.PI*.76),new MeshBasicMaterial({color:'#b2e3d9',transparent:true,opacity:.32,depthWrite:false}),0,-.68,-3.6);wake.rotation.x=-Math.PI/2;wake.scale.set(1.2,3.3,1);wake.visible=false;
 const light=new PointLight('#ffd49a',0,20,2);light.position.set(0,2,-3);g.add(light);
 return {g,hull,rig,sails,guns,hold,section,people,dolls,racks,flames,enemy,flags,emblems,belts,beltDefaults:belts.map((m:any)=>'#'+m.color.getHexString()),sailDefault:enemy?'#bd725a':'#efe2bd',flagDefault:enemy?'#803c38':'#284640',wake,light};
}
export function makeLongboat(){
 const g=new Group();const v:number[]=[],ind:number[]=[];const cross=[[-1,.14],[-.8,.43],[.55,.43],[1.08,.04]];
 for(let i=0;i<cross.length-1;i++){const n=v.length/3;for(const side of [-1,1])for(const [z,w] of [cross[i],cross[i+1]]){v.push(side*w,.22,z,side*w*.7,-.12,z);}ind.push(n,n+2,n+1,n+1,n+2,n+3,n+4,n+5,n+6,n+5,n+7,n+6);}
 mesh(g,geometry(v,ind),new MeshStandardMaterial({color:'#946a41',roughness:.86,side:DoubleSide}));for(const z of [-.6,0,.6])box(g,0,.16,z,.70,.055,.22,'#c6a16c');for(const side of [-1,1])beam(g,[side*.35,.23,-.8],[side*.4,.23,.6],.035,'#d6b67b');
 for(let i=0;i<2;i++){const d=crewDoll(i?'#8aadaf':'#77a891',i?5:3);d.scale.set(.65,.65,.65);d.position.set(0,.18,i?-.5:.45);g.add(d);}
 const oars:any[]=[];for(const side of [-1,1]){const oar=new Group();oar.position.set(side*.4,.22,0);box(oar,side*.5,0,0,1.5,.035,.07,'#d2b079');box(oar,side*1.15,0,0,.3,.035,.16,'#b18d59');g.add(oar);oars.push(oar);}g.userData.oars=oars;g.scale.set(2.6,2.6,2.6);scene.add(g);return g;
}
const leafV:number[]=[],leafI:number[]=[];
for(let i=0;i<=8;i++){const t=i/8,w=Math.sin(t*Math.PI)*.22;leafV.push(-w,-t*t*.24,t,w,-t*t*.24,t);if(i<8){const a=i*2;leafI.push(a,a+2,a+1,a+1,a+2,a+3);}}
const leafGeo=geometry(leafV,leafI);
export function palm(g:any,x:number,z:number,h:number,seed:number){const p=new Group();p.position.set(x,.84,z);g.add(p);const bend=Math.sin(seed)*.4;for(let i=0;i<5;i++){const t=i/5;beam(p,[bend*t*t,h*t,0],[bend*(t+.2)*(t+.2),h*(t+.2),0],.10-t*.035,i%2?'#aa8b59':'#927443');}for(let i=0;i<7;i++){const f=mesh(p,leafGeo,new MeshStandardMaterial({color:i%2?'#527e4c':'#6c9854',roughness:1,side:DoubleSide}),bend,h,0);f.scale.set(1.8,1.7,1.9);f.rotation.y=i*Math.PI*2/7+seed;f.rotation.x=-.10+(i%3)*.12;}for(let i=0;i<3;i++)sphere(p,bend+Math.sin(i)*.12,h-.10,Math.cos(i)*.12,.11,'#72563a');}
export function pine(g:any,x:number,z:number,h:number){cylinder(g,x,h*.4,z,.12,.17,h*.8,'#876744');for(let i=0;i<4;i++){const cone=cylinder(g,x,h*(.45+i*.16),z,0,(.95-i*.16)*h/3,h*.6,i%2?'#477060':'#365c53',8);cone.rotation.y=i*.5;}}
export function house(g:any,x:number,z:number,w:number,roofColor:string,wallColor:string){
 const h=1.35;box(g,x,1.0+h/2,z,w,h,1.35,wallColor);for(const side of [-1,1]){const roof=box(g,x+side*w*.28,2.5,z,w*.68,.12,1.65,roofColor);roof.rotation.z=-side*.52;for(let i=0;i<6;i++){const tile=box(g,x+side*w*.28,2.58,z-.72+i*.28,w*.69,.026,.025,'#b97852');tile.rotation.z=-side*.52;}}
 box(g,x,1.5,z+.69,.34,.95,.035,'#4b5142');box(g,x,1.53,z+.72,.02,.87,.02,'#a78b59');for(const dx of [-w*.31,w*.31]){box(g,x+dx,1.94,z+.7,.27,.30,.04,'#294b4a');box(g,x+dx,1.94,z+.73,.025,.32,.02,'#e2c68f');box(g,x+dx,1.94,z+.73,.29,.025,.02,'#e2c68f');}box(g,x,.93,z+.9,w*.7,.12,.45,'#baae86');
 const awning=box(g,x,2.11,z+1,.8,.06,.6,'#c4b78c');awning.rotation.x=.15;for(const side of [-1,1])beam(g,[x+side*.42,.95,z+1.25],[x+side*.42,2.05,z+1.25],.025,'#8b7351');
}
let oceanMaterial:any=null;const birds:any[]=[];const particles:any[]=[];
const SHOALS:any[]=Array.from({length:8},()=>new Vector4(0,0,0,0));
/** Fishing grounds from the authority (units): a dark boil of fish on the surface. */
export function setShoals(list:{x:number,z:number,r:number}[]){for(let k=0;k<8;k++){const q=list?.[k];SHOALS[k].set(q?q.x*METRES:0,q?q.z*METRES:0,q?q.r*METRES:0,0);}if(oceanMaterial)oceanMaterial.hooks.uniforms.shoals.value=SHOALS;}
const WAKES:any[]=Array.from({length:8},()=>new Vector4(0,0,0,0));
// Wake trails are simulated, not drawn from the ship's current heading: the
// stern drops a crumb into the water every few metres, and each crumb ages
// where it fell. The shader joins consecutive crumbs into segments, widens the
// turbulent centre with age and pushes the Kelvin arms outward at about
// 19.5° of the distance run, so a turn leaves a curved wake that slowly fades.
const CRUMBS=96,CRUMB:any[]=Array.from({length:CRUMBS},()=>new Vector4(0,0,0,0)),TRAIL_LIFE=8,CRUMB_GAP=7,STERN=11;
const trails=new Map<string,{id:string,pts:{x:number,z:number,t:number,way:number}[],seen:number}>();
/** ships: up to eight moving hulls, world metres, heading and way 0..1, nearest first. */
export function setWakes(list:{id:string,x:number,z:number,heading:number,way:number}[],time:number){
 for(let k=0;k<8;k++){const w=list[k];WAKES[k].set(w?w.x:0,w?w.z:0,w?w.heading:0,w?Math.max(0,Math.min(1,w.way)):0);}
 for(const w of list){const sx=w.x-Math.sin(w.heading)*STERN,sz=w.z-Math.cos(w.heading)*STERN,way=Math.max(0,Math.min(1,w.way));
  let tr=trails.get(w.id);if(!tr){tr={id:w.id,pts:[],seen:time};trails.set(w.id,tr);}tr.seen=time;
  const head={x:sx,z:sz,t:time,way};const last=tr.pts[1];
  if(tr.pts.length<2||Math.hypot(sx-last.x,sz-last.z)>CRUMB_GAP){if(tr.pts.length&&Math.hypot(sx-tr.pts[0].x,sz-tr.pts[0].z)>CRUMB_GAP*4)tr.pts.length=0;tr.pts.unshift(head);}
  tr.pts[0]=head;}
 // Crumbs keep ageing after a ship stops or leaves view; old ones sink away.
 const order:any[]=[];for(const [id,tr] of trails){while(tr.pts.length&&time-tr.pts[tr.pts.length-1].t>TRAIL_LIFE)tr.pts.pop();if(!tr.pts.length){trails.delete(id);continue;}if(time-tr.seen>0)tr.pts[0].way*=.9;order.push(tr);}
 const rank=new Map(list.map((w,i)=>[w.id,i]));order.sort((a,b)=>(rank.get(a.id)??99)-(rank.get(b.id)??99));
 let n=0;for(const tr of order){if(n>=CRUMBS-2)break;for(const p of tr.pts){if(n>=CRUMBS-1)break;CRUMB[n++].set(p.x,p.z,time-p.t,Math.max(.001,p.way));}CRUMB[n++].set(0,0,0,0);}
 for(;n<CRUMBS;n++)CRUMB[n].set(0,0,0,0);
 if(oceanMaterial){oceanMaterial.hooks.uniforms.wakes.value=WAKES;oceanMaterial.hooks.uniforms.crumbs.value=CRUMB;}
}
export function createOcean(places:any[]){
 oceanMaterial=new MeshStandardMaterial({color:'#187d8e',roughness:.28,metalness:.13,hooks:{uniforms:{time:{value:0},islands:{value:places.map(p=>new Vector4(p.x*METRES,p.z*METRES,p.kind==='wreck'?6:p.kind==='island'?32:16,0))},wakes:{value:WAKES},crumbs:{value:CRUMB},shoals:{value:SHOALS}},vertex:`fn vertex(v: Vertex) -> Vertex { var o=v; let t=uniforms.time; let x=v.position.x; let y=v.position.y; o.position.z=sin(x*0.035+t*0.7)*0.32+sin(y*0.042-t*0.55)*0.22; o.normal=normalize(vec3f(-cos(x*0.035+t*0.7)*0.0112,-cos(y*0.042-t*0.55)*0.00924,1.0)); return o; }`,surface:`fn surface(s: Surface) -> Surface { var o=s; var d=10000.0; for(var i=0;i<9;i++){ d=min(d,length(s.world.xz-uniforms.islands[i].xy)-uniforms.islands[i].z); } let shoal=1.0-smoothstep(0.0,30.0,d); let wave=sin(s.world.x*0.23+s.world.z*0.17+uniforms.time*0.8+sin(s.world.z*0.08)*2.0); let lace=pow(max(0.0,wave),28.0)*(0.5+0.5*sin(s.world.x*0.061-s.world.z*0.047)); let shore=(1.0-smoothstep(0.0,4.5,abs(d-2.0)))*(0.35+0.65*max(0.0,sin(d*1.8-uniforms.time*1.4))); var base=mix(vec3f(0.019,0.16,0.22),vec3f(0.08,0.48,0.43),shoal); var glint=0.0; for(var q=0;q<8;q++){ let f=uniforms.shoals[q]; if(f.z<=0.0){continue;} let fd=length(s.world.xz-f.xy); if(fd>f.z*1.3){continue;} let k=1.0-smoothstep(f.z*0.35,f.z*1.3,fd); let swirl=sin(s.world.x*0.7+uniforms.time*4.0+sin(s.world.z*0.5+uniforms.time*2.0)*2.0)*sin(s.world.z*0.9-uniforms.time*3.3); base=mix(base,base*0.62+vec3f(0.0,0.03,0.04),k*0.6); glint=max(glint,k*pow(max(0.0,swirl),24.0)*0.6); } var foam=0.0; let n=0.55+0.45*sin(s.world.x*0.9+uniforms.time*3.0)*sin(s.world.z*0.8-uniforms.time*2.3); for(var k=0;k<8;k++){ let w=uniforms.wakes[k]; if(w.w<0.01){continue;} let rel=s.world.xz-w.xy; let fw=vec2f(sin(w.z),cos(w.z)); let side=vec2f(cos(w.z),-sin(w.z)); let along=dot(rel,fw); let across=abs(dot(rel,side)); let bow=(1.0-smoothstep(4.2,6.5,across))*smoothstep(-13.0,-6.0,-abs(along))*step(-13.0,along)*(1.0-smoothstep(0.0,3.0,max(0.0,across-4.5))); foam=max(foam,w.w*bow*0.5*n); } for(var k=0;k<95;k++){ let a=uniforms.crumbs[k]; let b=uniforms.crumbs[k+1]; if(a.w<=0.0&&b.w<=0.0){break;} if(a.w<=0.0||b.w<=0.0){continue;} let ba=b.xy-a.xy; let pa=s.world.xz-a.xy; let reach=4.0+6.5*max(a.w,b.w)*b.z+3.0; if(dot(pa,pa)>(length(ba)+reach)*(length(ba)+reach)){continue;} let hr=dot(pa,ba)/max(dot(ba,ba),0.0001); let h=clamp(hr,0.0,1.0); let dist=length(pa-ba*h); let age=mix(a.z,b.z,h); let way=mix(a.w,b.w,h); let core=2.2+age*0.55; let trail=(1.0-smoothstep(core*0.35,core,dist))*(1.0-smoothstep(1.0,7.5,age))*(0.7+0.3*n); let spread=3.4+4.2*way*age; let flank=smoothstep(-0.08,0.02,hr)*(1.0-smoothstep(0.98,1.08,hr)); let arm=(1.0-smoothstep(0.0,0.55+age*0.12,abs(dist-spread)))*(1.0-smoothstep(0.8,4.5,age))*smoothstep(0.1,0.6,age)*flank; foam=max(foam,way*(trail*0.6+arm*0.38)*n); } o.base_color=vec4f(mix(base,vec3f(0.64,0.82,0.73),min(0.85,shore*0.65+lace*0.045+foam*0.8+glint*0.7)),1.0); o.roughness=0.28+shoal*0.3; return o; }`}});
 const sea=mesh(scene,new PlaneGeometry(2400,2400,96,96),oceanMaterial,0,-2.1,0);sea.rotation.x=-Math.PI/2;sea.castShadow=false;sea.receiveShadow=true;
 const wingGeo=geometry([0,0,0,.6,.10,.06,1.1,-.08,-.09, .65,-.01,.15],[0,1,3,1,2,3]);
 for(let i=0;i<9;i++){const b=new Group();for(const side of [-1,1]){const wing=mesh(b,wingGeo,new MeshStandardMaterial({color:'#e9e5d0',side:DoubleSide}));wing.scale.x=side;}b.position.set(0,0,0);b.scale.set(1.3,1.3,1.3);scene.add(b);birds.push(b);}
 for(let i=0;i<42;i++){const m=mesh(scene,ball,new MeshBasicMaterial({color:i%3?'#b9b5a2':'#ffd296',transparent:true,opacity:.6,depthWrite:false}));m.visible=false;m.castShadow=false;particles.push({m,age:100,life:1,vx:0,vy:0,vz:0});}
 return {sea};
}
export function burst(x:number,z:number,impact=false){let n=0;for(const p of particles){if(p.age<p.life)continue;p.age=0;p.life=impact?.8:1.4;p.m.visible=true;p.m.position.set(x*METRES,4,z*METRES);p.vx=Math.sin(n*4.1)*2.5;p.vz=Math.cos(n*3.3)*2.5;p.vy=2+n*.2;p.m.scale.set(.45,.45,.45);if(++n===7)break;}}
export function animateEnvironment(time:number,dt:number,focus:any){
 if(oceanMaterial)oceanMaterial.hooks.uniforms.time.value=time;
 for(let i=0;i<birds.length;i++){const b=birds[i],a=time*.07+i*2.4;b.position.set((focus?.x||0)*METRES+Math.sin(a)*52,24+Math.sin(time*.3+i)*3,(focus?.z||0)*METRES+Math.cos(a)*42);b.rotation.y=-a;b.children[0].rotation.z=Math.sin(time*2.4+i)*.14;b.children[1].rotation.z=-Math.sin(time*2.4+i)*.14;}
 for(const p of particles){if(p.age>=p.life){p.m.visible=false;continue;}p.age+=dt;p.m.position.x+=p.vx*dt;p.m.position.z+=p.vz*dt;p.m.position.y+=p.vy*dt;const s=.4+p.age*1.7;p.m.scale.set(s,s,s);p.m.material.opacity=.60*(1-p.age/p.life);}
}
/** wind: the direction the wind blows towards (authority convention, like a heading);
    knots: its strength; speed: the ship's way in authority units/s; simulate: near the camera. */
export function animateShip(obj:any,time:number,moving:boolean,mine:boolean,light:number,env:any={}){
 obj.light.intensity=mine?(1-light)*9:0;obj.wake.visible=false;
 if(!env.simulate)return;
 // Apparent wind in the ship's frame: true wind minus the ship's own way.
 const a=(env.wind||0)-(env.heading||0),k=(env.knots||12)/12,speed=env.speed||0;
 const wx=Math.sin(a)*k*3.2,wz=Math.cos(a)*k*3.2-speed*1.6,gust=env.storm?1:.55;
 if((obj.furl??1)>.85)for(const s of obj.sails)s.userData.cloth.step(env.dt||1/60,time,wx*.6,wz*.9+.9,gust);
 for(const f of obj.flags)f.userData.cloth.step(env.dt||1/60,time,wx*2.2,wz*2.2,gust);
}

// ---- Applying crew-designed mods (validated data from the authority) ----
const CREW_IDS=['morrow','brisk','fuse','peg','tallow','pip'];
const SAIL_CODES=[0,1,2,3,4],FLAG_CODES=[0,5,6];
function setAccent(material:any,hex:string,pattern:number,emblem:number){const u=material.hooks?.uniforms;if(!u)return;const c=new Color(hex);u.ar.value=c.r;u.ag.value=c.g;u.ab.value=c.b;u.pattern.value=pattern;u.emblem.value=emblem;}
function shade(hex:string,f:number){const c=new Color(hex);c.multiplyScalar(f);return '#'+c.getHexString();}
function outfitPiece(d:any,garment:number,primary:string,secondary:string){
 const g=new Group();
 if(garment===0){const coat=cylinder(g,0,.36,0,.2,.24,.36,primary);coat.scale.z*=.9;box(g,0,.46,.17,.05,.3,.02,secondary);}
 else if(garment===1){const sash=box(g,0,.43,.12,.06,.42,.05,secondary);sash.rotation.z=.75;box(g,.15,.3,.13,.09,.14,.04,secondary);}
 else if(garment===2){const b=sphere(g,0,.96,-.01,.205,primary);b.scale.set(.205,.1,.185);box(g,-.05,.93,-.2,.06,.12,.03,secondary);}
 else if(garment===3){const brim=sphere(g,0,1.05,0,.29,primary);brim.scale.set(.31,.045,.24);const crown=sphere(g,0,1.11,-.015,.22,primary);crown.scale.set(.22,.11,.16);sphere(g,0,1.16,.15,.035,secondary);}
 else {box(g,0,.47,.12,.27,.3,.05,primary);for(let i=0;i<3;i++)sphere(g,0,.38+i*.08,.15,.014,secondary);}
 d.add(g);return g;
}
function weaponPiece(d:any,kind:number,primary:string,secondary:string){
 const g=new Group();g.position.set(-.24,.32,.04);
 if(kind===0){box(g,0,-.1,0,.025,.34,.012,'#d9dcd6');box(g,0,.08,0,.11,.03,.03,secondary);box(g,0,.13,0,.03,.08,.03,primary);}
 else if(kind===1){box(g,0,0,0,.03,.4,.03,primary);box(g,.05,.17,0,.11,.08,.015,'#bcc0bb');}
 else if(kind===2){const barrel=box(g,0,-.03,.04,.025,.25,.025,'#3a3631');barrel.rotation.x=.2;box(g,0,.1,0,.05,.09,.06,primary);sphere(g,0,.13,.0,.02,secondary);}
 else if(kind===3){box(g,0,.15,0,.02,.8,.02,primary);const tip=box(g,0,.58,0,.06,.1,.012,'#d9dcd6');tip.rotation.z=.78;g.position.set(-.3,.25,-.05);}
 else {cylinder(g,0,0,0,.025,.035,.3,primary);sphere(g,0,.16,0,.03,secondary);}
 d.add(g);return g;
}
// A makeover: hairstyle in the primary colour, one face feature in the secondary.
function makeoverPiece(d:any,style:number,feature:number,hairColor:string,accent:string){
 const g=new Group();
 if(style!==4){const cap=sphere(g,0,.94,-.03,.19,hairColor);cap.scale.set(.2,.1,.18);}
 if(style===1)for(const side of [-1,1]){box(g,side*.16,.72,-.03,.05,.26,.05,hairColor);sphere(g,side*.16,.58,-.03,.03,accent);}
 if(style===2){sphere(g,0,1.07,-.05,.075,hairColor);box(g,0,1.0,-.05,.05,.04,.05,accent);}
 if(style===3){const mane=sphere(g,0,.9,-.07,.2,hairColor);mane.scale.set(.24,.18,.21);box(g,0,.72,-.15,.3,.32,.08,hairColor);}
 if(feature===1){box(g,.068,.88,.185,.075,.065,.02,'#1d1b19');beam(g,[-.19,.93,.03],[.15,.9,.18],.01,accent);}
 if(feature===2)for(const side of [-1,1]){const r=ring(g,side*.19,.78,0,.03,accent);r.rotation.y=Math.PI/2;}
 if(feature===3){const scar=box(g,.085,.83,.172,.012,.09,.01,'#9c5a49');scar.rotation.z=.6;}
 if(feature===4){const beard=sphere(g,0,.73,.11,.13,hairColor);beard.scale.set(.145,.13,.11);}
 if(feature===5){box(g,-.05,.785,.18,.07,.022,.025,hairColor).rotation.z=-.25;box(g,.05,.785,.18,.07,.022,.025,hairColor).rotation.z=.25;}
 if(feature===6){for(const side of [-1,1]){const lens=ring(g,side*.07,.89,.18,.05,accent);lens.scale.z=.5;}box(g,0,.9,.02,.4,.035,.3,'#3b332b');}
 if(feature===7){const ink=box(g,-.085,.84,.168,.035,.035,.01,accent);ink.rotation.z=.78;}
 d.add(g);return g;
}
export function applyLook(obj:any,look:any,palette:any[]){
 const key=JSON.stringify(look||null);if(obj.userData?.lookKey===key)return;obj.userData={...(obj.userData||{}),lookKey:key};
 const hex=(i:number,fallback:string)=>palette?.[i]?.hex||fallback;
 const sail=look?.sail?.spec,hull=look?.hull?.spec,flag=look?.flag?.spec;
 for(const s of obj.sails){s.material.color.set(sail?hex(sail.primary,obj.sailDefault):obj.sailDefault);setAccent(s.material,sail?hex(sail.secondary,'#000'):'#000',sail?SAIL_CODES[sail.pattern]??0:0,sail?sail.emblem:0);if(!sail)s.material.hooks.uniforms.pattern.value=0;}
 obj.belts.forEach((m:any,i:number)=>{if(!hull){m.color.set(obj.beltDefaults[i]);return;}const p=hex(hull.primary,obj.beltDefaults[i]),q=hex(hull.secondary,p);
  const c=hull.pattern===1&&i===3?q:hull.pattern===2&&i%2?q:hull.pattern===3&&i===4?'#c6a15b':hull.pattern===3&&i===3?q:shade(p,.62+i*.1);m.color.set(c);});
 for(let i=0;i<obj.flags.length;i++){const m=obj.flags[i].material;m.color.set(flag?hex(flag.primary,obj.flagDefault):obj.flagDefault);setAccent(m,flag?hex(flag.secondary,'#000'):'#000',flag?FLAG_CODES[flag.pattern]??0:0,flag?flag.emblem:0);if(obj.emblems[i])obj.emblems[i].visible=!flag||flag.emblem===0;}
 for(let i=0;i<obj.dolls.length;i++){const d=obj.dolls[i],mods=look?.crew?.[CREW_IDS[i]]||{};
  for(const old of d.userData.mods||[])d.remove(old);d.userData.mods=[];
  const base=d.userData.baseColor||(d.userData.baseColor='#'+d.userData.uniform[0].material.color.getHexString());
  const cloth=mods.clothing?.spec,arms=mods.weapon?.spec,face=mods.look?.spec;
  if(d.userData.hair)d.userData.hair.visible=!face;if(d.userData.beard)d.userData.beard.visible=!face;
  if(face)d.userData.mods.push(makeoverPiece(d,face.pattern,face.emblem,hex(face.primary,'#493c2d'),hex(face.secondary,'#ccad67')));
  for(const m of d.userData.uniform)m.material=mat(cloth?hex(cloth.primary,base):base);
  if(cloth)d.userData.mods.push(outfitPiece(d,cloth.pattern,hex(cloth.primary,base),hex(cloth.secondary,'#ccad67')));
  if(arms)d.userData.mods.push(weaponPiece(d,arms.pattern,hex(arms.primary,'#6b4a2e'),hex(arms.secondary,'#ccad67')));
 }
}
