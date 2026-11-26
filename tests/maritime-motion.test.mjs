import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cameraFrame,hullFrame,METRES,smoothPose} from '../src/navigation.js';

const moduleBytes=fs.readFileSync(new URL('../assets/maritime.wasm',import.meta.url));

async function load(){
 const {instance}=await WebAssembly.instantiate(moduleBytes);
 const wasm=instance.exports;
 const values=new Float64Array(wasm.memory.buffer,wasm.motion_buffer(),wasm.motion_capacity()*11);
 return {values,wasm};
}

function close(actual,expected){
 assert.equal(actual.length,expected.length);
 actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-9,
  `component ${i}: got ${value}, expected ${expected[i]}`));
}

test('Rust fleet smoothing wraps headings and snaps teleports in the same batch',async()=>{
 const {values,wasm}=await load();
 const start={x:0,z:0,heading:Math.PI-.05};
 const targets=[{x:1,z:1,heading:-Math.PI+.05},{x:20,z:-20,heading:0}];
 values.set(targets.flatMap(target=>[...Object.values(start),...Object.values(target)]));
 wasm.smooth_poses(2,1/60);
 for(let i=0;i<targets.length;i++){
  close(values.slice(i*6,i*6+3),Object.values(smoothPose(start,targets[i],1/60)));
 }
});

test('Rust ship pose matches the script through wave arrival, loss and furling',async()=>{
 const {values,wasm}=await load();
 const dt=1/60,x=5,heading=.8;
 let pitch=0,bob,roll=0,furl;
 for(let frame=0;frame<180;frame++){
  const wave=frame>20&&frame<160?{height:1.1,sx:.1,sz:-.06}:undefined;
  const target=frame>100?.12:1,elapsed=frame*dt;
  const expected=hullFrame(x,heading,pitch,bob,roll,furl,target,wave,dt,elapsed);
  values.set([x,heading,pitch,bob??NaN,roll,furl??NaN,target,Number(!!wave),
   wave?.height??0,wave?.sx??0,wave?.sz??0]);
  wasm.pose_hulls(1,dt,elapsed);
  close([values[0],values[1],values[2],values[3]||0,values[4],values[5]],expected.map(x=>x??0));
  pitch=values[1];
  bob=Number.isNaN(values[3])?undefined:values[3];
  roll=values[4];
  furl=values[5];
 }
});

test('Rust camera matches chart, combat, deck and longboat transitions',async()=>{
 const {values,wasm}=await load();
 const camera={yaw:Math.atan2(30,39),range:1,battle:0,aimX:0,aimZ:0};
 let cameraState=Object.values(camera);
 for(let frame=0;frame<200;frame++){
  const view={
   focus:{x:3,z:-5},foeX:12,foeZ:9,hasFoe:frame>=40&&frame<120,targetYaw:frame<160?-.5:2.9,
   dt:1/60,elapsed:frame/60,zoom:Math.min(1,frame/40),deck:frame<90?0:1,
   orbitYaw:.4,orbitPitch:-.1,shake:frame===60?.4:0,narrow:frame>=80,away:frame>=150
  };
  values.set([...cameraState,view.focus.x,view.focus.z,view.foeX,view.foeZ,view.targetYaw,
   view.dt,view.elapsed,view.zoom,view.deck,view.orbitYaw,view.orbitPitch,view.shake,
   Number(view.narrow),Number(view.away),Number(view.hasFoe),METRES]);
  wasm.pose_camera();
  const expected=cameraFrame(camera,view);
  close(values.slice(0,5),Object.values(camera));
  close(values.slice(5,7),Object.values(view.focus));
  close(values.slice(7,13),expected);
  cameraState=Array.from(values.slice(0,5));
 }
});

test('Rust crew poses carry, climb and hammer together while skipping hidden sailors',async()=>{
 const {values,wasm}=await load();
 // Start, goal, pose, clock, prop, scratch, active.
 values.set([0,1,0,0,0,1,1,0,0,5,0,2,0,0,0,1],0);
 values.set([0,1,0,0,0,0,2,0,0,3,0,1,0,0,0,1],16);
 values.set([2,1,0,0,0,2,1,0,0,7,Math.PI/12,4,0,0,0,1],32);
 values.set([10,10,10,0,0,0,0,0,0,0,0,0,0,0,0,0],48);
 wasm.pose_crew(4,.1);
 close(values.slice(0,5),[.075,1,0,Math.PI/2,.85]);
 close(values.slice(8,15),[-1.05,-.25,-Math.sin(.85)*.45,-1.05,.25,2,0]);
 close(values.slice(16,21),[0,1.14,0,0,.7]);
 assert.equal(values[29],0);
 close(values.slice(37,47),[.18,0,-1.4,-.6,0,.2,-.5,0,4,.2]);
 close(values.slice(48,51),[10,10,10]);
});
