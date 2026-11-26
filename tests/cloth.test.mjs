import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Rust cloth keeps the rigging pinned and each mesh owns its motion',async()=>{
 const asset=new URL('../assets/maritime.wasm',import.meta.url);
 const {instance}=await WebAssembly.instantiate(fs.readFileSync(asset));
 const wasm=instance.exports;
 function rig(flag){
  const width=4,height=3,vertices=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)vertices.push(x*.4,0-y*.5,0);
  const handle=wasm.cloth_new(width-1,height-1,Number(flag));
  const [positions,previous,rest,pins,normals]=new Uint32Array(wasm.memory.buffer,wasm.cloth_buffers(handle),5);
  for(const address of [positions,previous,rest]){
   new Float32Array(wasm.memory.buffer,address,vertices.length).set(vertices);
  }
  new Uint8Array(wasm.memory.buffer,pins,width*height).fill(1,0,width);
  wasm.cloth_setup(handle);
  return {handle,positions,normals,vertices};
 }
 const flag=rig(true),sail=rig(false);
 const floats=(address,length)=>new Float32Array(wasm.memory.buffer,address,length);
 for(let i=0;i<15;i++)wasm.cloth_step(flag.handle,1,i/30,4,2,.45);
 const positions=floats(flag.positions,flag.vertices.length);
 const normals=floats(flag.normals,flag.vertices.length);
 assert.deepEqual(Array.from(positions.slice(0,12)),Array.from(Float32Array.from(flag.vertices.slice(0,12))));
 assert.ok(Math.abs(positions.at(-1))>.001);
 for(let i=0;i<normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...normals.slice(i,i+3))-1)<.00001);
 assert.deepEqual(floats(sail.positions,sail.vertices.length),Float32Array.from(sail.vertices));
});
