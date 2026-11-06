import {scene,InstancedMesh,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,Matrix4,Quaternion,Vector3,Color,DoubleSide} from 'starhermit:scene';
import {islandGround} from '../islands.js';
import {cloudUniforms,cloudLighting,weatherUniform} from './weather.js';

// Dense shore grasses remain one instanced draw; wind bends the free tips.
export class ShoreDetail {
 private mesh:InstancedMesh;
 private material:MeshStandardMaterial;
 private time={value:0};
 constructor(places:any[],index:number){
  const perIsland=[0,0,0,0,0,0,1000,3000,7000,16000][index],entries:{x:number,y:number,z:number,seed:number}[]=[];
  let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  places.forEach((p,i)=>{
   if(p.kind!=='island')return;
   for(let n=0;n<perIsland;n++){
    const a=random()*Math.PI*2,r=Math.sqrt(random())*25,x=Math.cos(a)*r,z=Math.sin(a)*r*.88,y=islandGround(p.id,i,x,z);
    if(y===null)continue;entries.push({x:p.x*10+x,y:y-.04,z:p.z*10+z,seed:random()});
   }
  });
  const g=new BufferGeometry(),v:number[]=[],ix:number[]=[];
  for(let i=0;i<=4;i++){const t=i/4,w=(1-t)*.065;v.push(-w,t*.7,t*t*.15,w,t*.7,t*t*.15);if(i<4){const a=i*2;ix.push(a,a+2,a+1,a+1,a+2,a+3);}}
  g.setAttribute('position',new Float32BufferAttribute(v,3));g.setIndex(ix);g.computeVertexNormals();
  this.material=new MeshStandardMaterial({color:'#63813f',roughness:.9,side:DoubleSide,hooks:{uniforms:{time:this.time,wet:weatherUniform,...cloudUniforms},light:cloudLighting,vertex:`
   fn vertex(v: Vertex) -> Vertex {var o=v;let world=(model_matrix()*vec4f(v.position,1.0)).xyz;let bend=v.position.y*v.position.y;
    o.position.x=o.position.x+sin(uniforms.time*1.8+world.x*.3+world.z*.2)*bend*.3;
    o.position.z=o.position.z+cos(uniforms.time*1.3+world.z*.35)*bend*.18;return o;}`,
   surface:`fn surface(s: Surface) -> Surface {var o=s;let vein=.92+.08*sin(s.world.y*85.0);o.base_color=vec4f(s.base_color.rgb*vein*(1.0-uniforms.wet*.2),s.base_color.a);return o;}`}});
  this.mesh=new InstancedMesh(g,this.material,Math.max(1,entries.length));this.mesh.count=entries.length;this.mesh.castShadow=index>=7;this.mesh.receiveShadow=true;this.mesh.layers.enable(1);
  const m=new Matrix4(),q=new Quaternion(),up=new Vector3(0,1,0),position=new Vector3(),scale=new Vector3(),color=new Color();
  entries.forEach((p,i)=>{q.setFromAxisAngle(up,p.seed*Math.PI*2);position.set(p.x,p.y,p.z);const h=.5+p.seed*1.2;scale.set(h,h,h);m.compose(position,q,scale);this.mesh.setMatrixAt(i,m);color.setRGB(.62+p.seed*.32,.7+p.seed*.3,.55+p.seed*.25);this.mesh.setColorAt(i,color);});
  this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;scene.add(this.mesh);
 }
 update(time:number){this.time.value=time;}
 dispose(){scene.remove(this.mesh);this.mesh.geometry.dispose();this.material.dispose();this.mesh.count=0;}
}
