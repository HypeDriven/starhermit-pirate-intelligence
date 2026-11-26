import {maritimeKernel,motionBuffer,motionCapacity} from './maritime-kernel.js';
import {cameraFrame,hullFrame,METRES,smoothPose} from './navigation.js';

type Point={x:number;z:number};
type Pose=Point & {heading:number};
type Ship=Point & {id:string;heading?:number;anchored?:boolean;npc?:boolean;ai?:string;vx?:number;vz?:number};
type Wave={height:number;sx:number;sz:number};
type Hull={
 g:{position:{set(x:number,y:number,z:number):void};rotation:{x:number;set(x:number,y:number,z:number):void}};
 bob?:number;roll?:number;furl?:number;nextFurl?:number;
};
type View={
 focus:Point;foeX:number;foeZ:number;hasFoe:boolean;targetYaw:number;dt:number;elapsed:number;
 zoom:number;deck:number;orbitYaw:number;orbitPitch:number;shake:number;narrow:boolean;away:boolean;
};

const POSE_FIELDS=6;
const HULL_FIELDS=11;

function furlTarget(ship:Ship,owner:string,away:boolean){
 return ship.anchored||ship.id===owner&&away||ship.npc&&ship.ai==='patrol'&&Math.hypot(ship.vx||0,ship.vz||0)<.2?.12:1;
}

export class MaritimeMotion {
 readonly poses:Record<string,Pose>=Object.create(null);
 private camera={yaw:Math.atan2(30,39),range:1,battle:0,aimX:0,aimZ:0};

 smooth(ships:Ship[],dt:number){
  const kernel=maritimeKernel;
  if(!kernel){
   for(const ship of ships)this.poses[ship.id]=smoothPose(this.poses[ship.id],ship,dt);
   return;
  }

  const values=motionBuffer(),capacity=motionCapacity;
  for(let start=0;start<ships.length;start+=capacity){
   const count=Math.min(ships.length-start,capacity);
   for(let i=0;i<count;i++){
    const ship=ships[start+i],heading=ship.heading||0;
    const pose=this.poses[ship.id]??(this.poses[ship.id]={x:ship.x,z:ship.z,heading});
    const row=i*POSE_FIELDS;
    values[row]=pose.x;
    values[row+1]=pose.z;
    values[row+2]=pose.heading;
    values[row+3]=ship.x;
    values[row+4]=ship.z;
    values[row+5]=heading;
   }
   kernel.smooth_poses(count,dt);
   for(let i=0;i<count;i++){
    const pose=this.poses[ships[start+i].id],row=i*POSE_FIELDS;
    pose.x=values[row];
    pose.z=values[row+1];
    pose.heading=values[row+2];
   }
  }
 }

 view(input:View){
  const kernel=maritimeKernel,c=this.camera;
  if(!kernel)return cameraFrame(c,input);
  const v=motionBuffer();
  v.set([c.yaw,c.range,c.battle,c.aimX,c.aimZ,input.focus.x,input.focus.z,input.foeX,input.foeZ,
   input.targetYaw,input.dt,input.elapsed,input.zoom,input.deck,input.orbitYaw,input.orbitPitch,input.shake,
   Number(input.narrow),Number(input.away),Number(input.hasFoe),METRES]);
  kernel.pose_camera();
  c.yaw=v[0];
  c.range=v[1];
  c.battle=v[2];
  c.aimX=v[3];
  c.aimZ=v[4];
  input.focus.x=v[5];
  input.focus.z=v[6];
  return v.subarray(7,13);
 }

 hulls(ships:Ship[],nodes:Record<string,Hull>,waves:ReadonlyMap<string,Wave>|undefined,owner:string,away:boolean,dt:number,elapsed:number){
  const kernel=maritimeKernel;
  if(!kernel){
   for(const ship of ships){
    const obj=nodes[ship.id],pose=this.poses[ship.id],target=furlTarget(ship,owner,away);
    const [height,pitch,roll,bob,prevRoll,furl]=hullFrame(ship.x,pose.heading,obj.g.rotation.x,obj.bob,
     obj.roll||0,obj.furl,target,waves?.get(ship.id),dt,elapsed);
    this.applyHull(obj,pose,height!,pitch!,roll!,bob,prevRoll!,furl!);
   }
   return;
  }

  const values=motionBuffer(),capacity=motionCapacity;
  for(let start=0;start<ships.length;start+=capacity){
   const count=Math.min(ships.length-start,capacity);
   for(let i=0;i<count;i++){
    const ship=ships[start+i],obj=nodes[ship.id],row=i*HULL_FIELDS;
    const wave=waves?.get(ship.id);
    values[row]=ship.x;
    values[row+1]=this.poses[ship.id].heading;
    values[row+2]=obj.g.rotation.x;
    values[row+3]=obj.bob??NaN;
    values[row+4]=obj.roll||0;
    values[row+5]=obj.furl??NaN;
    values[row+6]=furlTarget(ship,owner,away);
    values[row+7]=Number(!!wave);
    values[row+8]=wave?.height??0;
    values[row+9]=wave?.sx??0;
    values[row+10]=wave?.sz??0;
   }
   kernel.pose_hulls(count,dt,elapsed);
   for(let i=0;i<count;i++){
    const ship=ships[start+i],row=i*HULL_FIELDS;
    const bob=values[row+3];
    this.applyHull(nodes[ship.id],this.poses[ship.id],values[row],values[row+1],values[row+2],
     Number.isNaN(bob)?undefined:bob,values[row+4],values[row+5]);
   }
  }
 }

 private applyHull(obj:Hull,pose:Pose,height:number,pitch:number,roll:number,bob:number|undefined,prevRoll:number,furl:number){
  obj.g.position.set(pose.x*METRES,height,pose.z*METRES);
  obj.g.rotation.set(pitch,pose.heading,roll);
  if(bob!==undefined)obj.bob=bob;
  obj.roll=prevRoll;
  obj.nextFurl=furl;
 }
}
