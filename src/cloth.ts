// Verlet cloth for sails and flags. Each cloth is a grid of particles held by
// stretch and shear constraints, with some particles pinned (a sail's
// head along its yard and its two clews; a flag's hoist along the mast).
// Apparent wind, gusts and gravity move the rest. The solver writes positions
// and normals straight into the mesh's buffers.
//
// Cost control: coarse grids, a fixed 30 Hz step, two constraint passes, and
// the caller only steps the nearest ships' cloth; far ones keep their last shape.

const STEP=1/30,PASSES=2;

export class Cloth{
 nx:number;ny:number;n:number;p:Float32Array;q:Float32Array;rest:Float32Array;pin:Uint8Array;
 ca:Int32Array;cb:Int32Array;cl:Float32Array;cl2:Float32Array;mesh:any;pos:any;nor:any;acc=0;flag:boolean;phase:number;
 constructor(mesh:any,nx:number,ny:number,pinned:(i:number,j:number)=>boolean,flag=false){
  this.mesh=mesh;this.nx=nx;this.ny=ny;this.n=(nx+1)*(ny+1);this.flag=flag;this.phase=Math.random()*10;
  const geo=mesh.geometry;this.pos=geo.getAttribute('position');this.nor=geo.getAttribute('normal');
  this.p=new Float32Array(this.pos.array);this.q=new Float32Array(this.p);this.rest=new Float32Array(this.p);
  this.pin=new Uint8Array(this.n);for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)this.pin[j*(nx+1)+i]=pinned(i,j)?1:0;
  const a:number[]=[],b:number[]=[];const link=(i:number,j:number,k:number,l:number)=>{if(i<0||i>nx||k<0||k>nx||l>ny)return;a.push(j*(nx+1)+i);b.push(l*(nx+1)+k);};
  // Stretch along both axes and one shear diagonal (alternating per row) keep it cheap.
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){link(i,j,i+1,j);link(i,j,i,j+1);if(j%2)link(i,j,i+1,j+1);else link(i+1,j,i,j+1);}
  this.ca=new Int32Array(a);this.cb=new Int32Array(b);this.cl=new Float32Array(a.length);
  for(let c=0;c<a.length;c++){const i=a[c]*3,k=b[c]*3;this.cl[c]=Math.hypot(this.p[k]-this.p[i],this.p[k+1]-this.p[i+1],this.p[k+2]-this.p[i+2]);}
  this.cl2=new Float32Array(this.cl.length);for(let c=0;c<this.cl.length;c++)this.cl2[c]=this.cl[c]*this.cl[c];
 }
 /** wx,wz: apparent wind in the cloth's own frame (units/s²); gust 0..1. */
 step(dt:number,time:number,wx:number,wz:number,gust:number){
  this.acc=Math.min(this.acc+dt,STEP*3);let moved=false;
  while(this.acc>=STEP){this.acc-=STEP;this.tick(time,wx,wz,gust);moved=true;}
  if(moved)this.write();
 }
 private tick(time:number,wx:number,wz:number,gust:number){
  const {p,q,pin,rest,n}=this,t=time+this.phase,flag=this.flag,dt2=STEP*STEP,damp=flag?.985:.97,g=flag?-2.2:-1.2;
  for(let v=0;v<n;v++){const i=v*3;if(pin[v]){p[i]=rest[i];p[i+1]=rest[i+1];p[i+2]=rest[i+2];q[i]=p[i];q[i+1]=p[i+1];q[i+2]=p[i+2];continue;}
   const x=p[i],y=p[i+1],z=p[i+2];
   // Gusts travel along the cloth; flags flutter harder and faster than canvas.
   const ripple=flag?Math.sin(t*11-x*9+y*3)*.9+Math.sin(t*17-x*14)*.45:Math.sin(t*2.3+x*1.7+y*1.3)*.35+Math.sin(t*5.1-y*2.2)*.15;
   const k=1+gust*ripple;
   const ax=wx*k+(flag?Math.sin(t*9+x*6)*.6*gust:0),ay=g+(flag?Math.sin(t*13-x*11)*1.2*gust:0),az=wz*k+(flag?Math.cos(t*10-x*8)*1.4*gust:0);
   const vx=(x-q[i])*damp,vy=(y-q[i+1])*damp,vz=(z-q[i+2])*damp;q[i]=x;q[i+1]=y;q[i+2]=z;
   p[i]=x+vx+ax*dt2;p[i+1]=y+vy+ay*dt2;p[i+2]=z+vz+az*dt2;}
  const {ca,cb,cl2}=this,m=ca.length;
  for(let pass=0;pass<PASSES;pass++)for(let c=0;c<m;c++){
   // Jakobsen's square-root-free relaxation: exact at the rest length, close near it.
   const a=ca[c],b=cb[c],i=a*3,k=b*3,dx=p[k]-p[i],dy=p[k+1]-p[i+1],dz=p[k+2]-p[i+2],r2=cl2[c],diff=1-2*r2/(dx*dx+dy*dy+dz*dz+r2);
   const wa=pin[a]?0:pin[b]?1:.5,wb=pin[b]?0:pin[a]?1:.5;
   p[i]+=dx*diff*wa;p[i+1]+=dy*diff*wa;p[i+2]+=dz*diff*wa;p[k]-=dx*diff*wb;p[k+1]-=dy*diff*wb;p[k+2]-=dz*diff*wb;}
 }
 private write(){
  const {p,nx,ny}=this,pa=this.pos.array as Float32Array,na=this.nor.array as Float32Array,w=nx+1;pa.set(p);
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
   const v=(j*w+i)*3,l=(j*w+Math.max(0,i-1))*3,r=(j*w+Math.min(nx,i+1))*3,u=(Math.max(0,j-1)*w+i)*3,d=(Math.min(ny,j+1)*w+i)*3;
   const ux=p[r]-p[l],uy=p[r+1]-p[l+1],uz=p[r+2]-p[l+2],vx=p[d]-p[u],vy=p[d+1]-p[u+1],vz=p[d+2]-p[u+2];
   let cx=vy*uz-vz*uy,cy=vz*ux-vx*uz,cz=vx*uy-vy*ux;const len=Math.sqrt(cx*cx+cy*cy+cz*cz)||1;na[v]=cx/len;na[v+1]=cy/len;na[v+2]=cz/len;}
  this.pos.needsUpdate=true;this.nor.needsUpdate=true;
 }
}
