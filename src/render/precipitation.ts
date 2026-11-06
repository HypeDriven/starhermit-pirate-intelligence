import {scene,Mesh,BufferGeometry,Float32BufferAttribute,ShaderMaterial,Vector3,DoubleSide} from 'starhermit:scene';

// Rain moves entirely on the GPU. One draw, no per-frame particle allocation.
export class SeaRain {
 readonly mesh:Mesh;
 private material:ShaderMaterial;
 constructor(count:number){
  const p:number[]=[],custom:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=0;i<count;i++){
   const a=((i*0.754877666)%1),b=((i*0.569840291)%1),c=((i*.438579021)%1),n=i*4;
   for(const [x,y] of [[-1,-1],[1,-1],[-1,1],[1,1]]){p.push(x,y,0);custom.push(a,b,c,i/count);uv.push((x+1)*.5,(y+1)*.5);}
   indices.push(n,n+1,n+2,n+2,n+1,n+3);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('custom',new Float32BufferAttribute(custom,4));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(indices);
  this.material=new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,uniforms:{time:{value:0},centre:{value:new Vector3()},wind:{value:new Vector3()},right:{value:new Vector3(1,0,0)},opacity:{value:0}},
   vertexShader:`fn vertex(v: Vertex) -> Vertex {
    var o=v;let seed=v.custom;let t=uniforms.time;
    let height=fract(seed.y-t*(.4+seed.w*.15))*70.0;
    let x=(fract(seed.x+t*uniforms.wind.x*.002)-.5)*130.0;
    let z=(fract(seed.z+t*uniforms.wind.z*.002)-.5)*130.0;
    let streak=normalize(vec3f(uniforms.wind.x*.07,-1.0,uniforms.wind.z*.07));
    o.position=uniforms.centre+vec3f(x,height-12.0,z)+uniforms.right*v.position.x*.016+streak*v.position.y*(.45+seed.w*.65);
    o.v0=vec4f(seed.w,height,0.0,0.0);return o;
   }`,fragmentShader:`fn fragment(f: Fragment) -> vec4f {
    let falloff=(1.0-abs(f.uv.x*2.0-1.0))*(1.0-abs(f.uv.y*2.0-1.0));
    let alpha=falloff*uniforms.opacity*(.08+.12*f.v0.x)*smoothstep(-2.1,-.8,f.world.y);
    return vec4f(vec3f(.48,.63,.73),alpha);
   }`});
  this.mesh=new Mesh(g,this.material);this.mesh.noAO=true;this.mesh.frustumCulled=false;this.mesh.renderOrder=8;this.mesh.visible=false;scene.add(this.mesh);
 }
 update(time:number,camera:any,wind:number,knots:number,strength:number){
  this.mesh.visible=strength>.01;if(!this.mesh.visible)return;
  const u=this.material.uniforms;u.time!.value=time;u.opacity!.value=strength;
  (u.centre!.value as Vector3).copy(camera.position);(u.centre!.value as Vector3).y=2;
  (u.wind!.value as Vector3).set(Math.sin(wind)*knots*.514,0,Math.cos(wind)*knots*.514);
  const e=camera.matrixWorld.elements;(u.right!.value as Vector3).set(e[0],e[1],e[2]);
 }
 dispose(){scene.remove(this.mesh);this.mesh.geometry.dispose();this.material.dispose();}
}
