import {files} from 'starhermit:engine';

type MaritimeKernel={
 memory:WebAssembly.Memory;
 cloth_new(nx:number,ny:number,flag:number):number;
 cloth_buffers(handle:number):number;
 cloth_setup(handle:number):void;
 cloth_step(handle:number,steps:number,time:number,wx:number,wz:number,gust:number):void;
 motion_buffer():number;
 motion_capacity():number;
 smooth_poses(count:number,dt:number):void;
 pose_hulls(count:number,dt:number,time:number):void;
 pose_camera():void;
 pose_crew(count:number,dt:number):void;
};

export let maritimeKernel:MaritimeKernel|null=null;
let loading:Promise<void>|null=null;
let buffer:Float64Array|null=null;
export let motionCapacity=0;

export function motionBuffer(){
 const kernel=maritimeKernel!;
 const memory=kernel.memory.buffer;
 if(buffer?.buffer!==memory){
  buffer=new Float64Array(memory,kernel.motion_buffer(),motionCapacity*11);
 }
 return buffer!;
}

export function loadMaritimeKernel(){
 const path='assets/maritime.wasm';
 return loading??=files.fetch(path).then(async()=>{
  const {instance}=await WebAssembly.instantiate(files.readBytes(path));
  const kernel=instance.exports as unknown as MaritimeKernel;
  motionCapacity=kernel.motion_capacity();
  maritimeKernel=kernel;
 }).catch(error=>console.warn('Using script motion solver: '+String(error)));
}
