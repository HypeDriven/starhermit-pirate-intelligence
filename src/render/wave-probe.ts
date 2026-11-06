import {renderer,Mesh,PlaneGeometry,ShaderMaterial,OrthographicCamera,RenderTarget,FloatType,NearestFilter,Vector4} from 'starhermit:scene';
import {oceanSampleWgsl,OceanSim} from './ocean-sim.js';

export type WaveBody={id:string,x:number,z:number};
// One 32-pixel GPU readback for the fleet. Previous results keep animation
// smooth while the host delivers the next samples asynchronously.
export class WaveProbe {
 private target=new RenderTarget(32,1,{type:FloatType,minFilter:NearestFilter,magFilter:NearestFilter,depthBuffer:false});
 private camera=new OrthographicCamera(-1,1,1,-1,.1,10);
 private positions=Array.from({length:32},()=>new Vector4());
 private material:ShaderMaterial;
 private mesh:Mesh;
 private pending=false;
 private disposed=false;
 readonly poses=new Map<string,{height:number,sx:number,sz:number}>();
 constructor(private sim:OceanSim){
  this.camera.position.z=5;
  this.material=new ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{displacement:{value:sim.displacement},points:{value:this.positions}},vertexShader:`fn vertex(v: Vertex) -> Vertex {var o=v;o.clip=vec4f(v.position.xy,0.0,1.0);return o;}`,
   fragmentShader:oceanSampleWgsl('displacement',3,sim.resolution)+`
   fn fragment(f: Fragment) -> vec4f {
    let p=uniforms.points[i32(floor(f.coord.x))].xy;let d=ocean_surface(p);
    let dx=ocean_surface(p+vec2f(0.8,0.0)).y-d.y;let dz=ocean_surface(p+vec2f(0.0,0.8)).y-d.y;
    return vec4f(d.y,dx/0.8,dz/0.8,1.0);
   }`});
  this.mesh=new Mesh(new PlaneGeometry(2,2),this.material);this.mesh.frustumCulled=false;
 }
 update(bodies:WaveBody[]){
  if(this.pending||!bodies.length||!renderer.readRenderTargetPixelsAsync)return;
  const list=bodies.slice(0,32);list.forEach((p,i)=>this.positions[i].set(p.x,p.z,0,0));
  this.material.uniforms.displacement!.value=this.sim.displacement;
  const old=renderer.getRenderTarget();
  try{renderer.setRenderTarget(this.target);renderer.render(this.mesh,this.camera);}finally{renderer.setRenderTarget(old);}
  this.pending=true;
  renderer.readRenderTargetPixelsAsync(this.target,0,0,32,1).then(data=>{
   if(this.disposed)return;
   for(let i=0;i<list.length;i++){
    const h=data[i*4],sx=data[i*4+1],sz=data[i*4+2];
    if(Number.isFinite(h)&&Number.isFinite(sx)&&Number.isFinite(sz))this.poses.set(list[i].id,{height:Math.max(-3,Math.min(3,h)),sx:Math.max(-.3,Math.min(.3,sx)),sz:Math.max(-.3,Math.min(.3,sz))});
   }
   for(const id of this.poses.keys())if(!list.some(p=>p.id===id))this.poses.delete(id);
  }).catch(()=>{}).finally(()=>{this.pending=false;});
 }
 dispose(){this.disposed=true;this.target.dispose();this.mesh.geometry.dispose();this.material.dispose();this.poses.clear();}
}
