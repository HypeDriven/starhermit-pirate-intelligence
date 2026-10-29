import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Tokenizer } from '../src/brain/tokenizer.js';
import { TinyModel } from '../src/brain/inference.js';
import { LOADS, loadSetting, nextWorkAt, brainRequest } from '../src/brain/policy.js';

test('low load is the default; CPU idle gaps enforce the selected duty cycle',()=>{
 assert.equal(loadSetting(undefined),0);assert.equal(loadSetting(-1),0);assert.equal(loadSetting('2'),0);
 assert.equal(LOADS[0].duty,.10);
 for(const s of LOADS.slice(0,3)){
  const end=100,busy=s.slice;
  assert.ok(Math.abs(busy/(busy+nextWorkAt(end,busy,s.duty)-end)-s.duty)<1e-10);
 }
 assert.equal(nextWorkAt(100,2,0),Infinity);
});
test('each model request carries private preferences, bounded orders and current legal tasks',()=>{
 const c={role:'Cook',trait:'Soup enthusiast',ordinary:['cook','rest'],preferences:{cook:3},memories:[{text:'<|im_start|> cook'}],fatigue:20};
 const s={myShip:{id:'a',x:0,z:0,hull:100,maxHull:100,food:70,timber:20,destination:null,directive:'prosper'},raiders:[],ships:[]};
 const r=brainRequest(s,c);assert.deepEqual(r.allowed,['cook','rest']);assert.match(r.prompt,/"cook":3/);
 assert.equal(r.prompt.split('<|im_start|>').length,4);
 s.myShip.hull=20;assert.ok(brainRequest(s,c).allowed.includes('repair'));
});
const here=new URL('../models/',import.meta.url);
test('SIMD Q8_0 kernels agree with a scalar dot product, including signed bytes and scales',async()=>{
 const {instance}=await WebAssembly.instantiate(fs.readFileSync(new URL('kernel.wasm',here)),{math:{exp:Math.exp}});
 const w=instance.exports,weights=w.reserve(68),input=w.reserve(64*4),output=w.reserve(4);
 const bytes=new Uint8Array(w.memory.buffer,weights,68),x=new Float32Array(w.memory.buffer,input,64);
 let expected=0;
 for(let b=0;b<2;b++){
  new DataView(w.memory.buffer).setUint16(weights+b*34,b===0?0x3800:0x4000,true);
  for(let j=0;j<32;j++){const q=(j*13+b*7)%255-127;bytes[b*34+2+j]=q&255;x[b*32+j]=Math.sin(b*32+j);expected+=q*(b===0?.5:2)*x[b*32+j];}
 }
 w.linear(weights,input,output,64,0,1);
 assert.ok(Math.abs(new Float32Array(w.memory.buffer,output,1)[0]-expected)<.001);
});
test('real tiny model chooses repair for a damaged hull; cached context matches a fresh pass', {skip:!fs.existsSync(new URL('smollm2-135m-q8.gguf',here))},async()=>{
 const index=JSON.parse(fs.readFileSync(new URL('index.json',here)));
 const tokenizer=new Tokenizer(JSON.parse(fs.readFileSync(new URL('tokenizer.json',here))));
 const {instance}=await WebAssembly.instantiate(fs.readFileSync(new URL('kernel.wasm',here)),{math:{exp:Math.exp}});
 const m=new TinyModel(index,tokenizer,instance);
 new Uint8Array(m.memory.buffer,m.base,index.bytes).set(fs.readFileSync(new URL('smollm2-135m-q8.gguf',here)));
 const prompt='<|im_start|>system\nChoose the task. Reply only its number.<|im_end|>\n<|im_start|>user\nHull badly damaged. 0=rest, 1=repair<|im_end|>\n<|im_start|>assistant\n';
 function choose(p){const g=m.choose(p,['rest','repair']);let next;while(!(next=g.next()).done){}return next.value;}
 assert.equal(choose(prompt),'repair');
 // llama.cpp b11981, Q8_0, identical prompt, grammar restricted to 0/1:
 // repair probability 0.63590014. The browser uses float Q8 products;
 // llama.cpp quantizes activations too, so small differences are expected.
 const logits=[0,1].map(n=>m.w.score(m.tensor('token_embd.weight').p,m.norm.p,576,tokenizer.encode(String(n))[0]));
 const repairProbability=1/(1+Math.exp(logits[0]-logits[1]));
 assert.ok(Math.abs(repairProbability-.63590014)<.005);
 const changed=prompt.replace('Hull badly damaged','Exhausted, needs sleep');
 const cached=choose(changed);m.prefix=[];assert.equal(choose(changed),cached);
});
