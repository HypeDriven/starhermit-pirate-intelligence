// Single-threaded, cooperatively sliced SmolLM2 inference using GGUF Q8_0.
// Each yield bounds one chunk of matrix work; the scheduler decides when to resume.
export class TinyModel {
 constructor(index,tokenizer,wasm){
  this.index=index;this.tokenizer=tokenizer;this.w=wasm.exports;
  this.base=this.w.reserve(index.bytes);this.memory=this.w.memory;
  this.alloc=n=>{const p=this.w.reserve(n*4);return {p,a:new Float32Array(this.memory.buffer,p,n)};};
  this.x=this.alloc(576);this.norm=this.alloc(576);this.q=this.alloc(576);this.k=this.alloc(192);this.v=this.alloc(192);
  this.att=this.alloc(576);this.proj=this.alloc(576);this.gate=this.alloc(1536);this.up=this.alloc(1536);this.scores=this.alloc(256);
  this.keys=Array.from({length:30},()=>this.alloc(256*192));this.values=Array.from({length:30},()=>this.alloc(256*192));
  this.prefix=[];
 }
 tensor(name){const t=this.index.tensors[name];if(!t)throw Error('Missing model tensor: '+name);return {...t,p:this.base+t.offset};}
 rms(out,input,name){const t=this.tensor(name);const weight=new Float32Array(this.memory.buffer,t.p,576);let ss=0;for(let i=0;i<576;i++)ss+=input.a[i]*input.a[i];const scale=1/Math.sqrt(ss/576+this.index.epsilon);for(let i=0;i<576;i++)out.a[i]=input.a[i]*scale*weight[i];}
 *linear(name,input,out){const t=this.tensor(name);for(let row=0;row<t.shape[1];row+=16){this.w.linear(t.p,input.p,out.p,t.shape[0],row,Math.min(row+16,t.shape[1]));yield;}}
 rope(vector,heads,pos){for(let h=0;h<heads;h++)for(let j=0;j<64;j+=2){const angle=pos/Math.pow(this.index.ropeTheta,j/64),c=Math.cos(angle),s=Math.sin(angle),i=h*64+j,a=vector.a[i],b=vector.a[i+1];vector.a[i]=a*c-b*s;vector.a[i+1]=a*s+b*c;}}
 *choose(prompt,allowed){
  const tokens=this.tokenizer.encode(prompt);if(tokens.length>256)throw Error('Brain context exceeds 256 tokens');
  let common=0;while(common<tokens.length-1&&common<this.prefix.length&&tokens[common]===this.prefix[common])common++;
  // Prefix K/V rows are valid only after a complete preceding request.
  const oldPrefix=this.prefix;this.prefix=[];
  for(let pos=common;pos<tokens.length;pos++){
   this.w.embed(this.tensor('token_embd.weight').p,this.x.p,576,tokens[pos]);
   for(let layer=0;layer<30;layer++){
    const name='blk.'+layer+'.';
    this.rms(this.norm,this.x,name+'attn_norm.weight');
    yield* this.linear(name+'attn_q.weight',this.norm,this.q);
    yield* this.linear(name+'attn_k.weight',this.norm,this.k);
    yield* this.linear(name+'attn_v.weight',this.norm,this.v);
    this.rope(this.q,9,pos);this.rope(this.k,3,pos);
    this.keys[layer].a.set(this.k.a,pos*192);this.values[layer].a.set(this.v.a,pos*192);
    this.w.attention(this.q.p,this.keys[layer].p,this.values[layer].p,this.att.p,this.scores.p,pos,9,3,64);yield;
    yield* this.linear(name+'attn_output.weight',this.att,this.proj);
    for(let i=0;i<576;i++)this.x.a[i]+=this.proj.a[i];
    this.rms(this.norm,this.x,name+'ffn_norm.weight');
    yield* this.linear(name+'ffn_gate.weight',this.norm,this.gate);
    yield* this.linear(name+'ffn_up.weight',this.norm,this.up);
    for(let i=0;i<1536;i++)this.gate.a[i]=this.gate.a[i]/(1+Math.exp(-this.gate.a[i]))*this.up.a[i];
    yield* this.linear(name+'ffn_down.weight',this.gate,this.proj);
    for(let i=0;i<576;i++)this.x.a[i]+=this.proj.a[i];
    yield;
   }
   yield {token:pos+1,total:tokens.length,cached:Math.min(common,oldPrefix.length)};
  }
  this.rms(this.norm,this.x,'output_norm.weight');
  // Constrained decoding: only digits corresponding to legal tasks can win.
  const output=this.tensor(this.index.tensors['output.weight']?'output.weight':'token_embd.weight');
  let best=-Infinity,choice=null;
  for(let i=0;i<allowed.length;i++){
   const ids=this.tokenizer.encode(String(i));if(ids.length!==1)throw Error('Task number must be one token');
   const score=this.w.score(output.p,this.norm.p,576,ids[0]);if(score>best){best=score;choice=allowed[i];}
  }
  this.prefix=tokens;
  if(!Number.isFinite(best)||!choice)throw Error('Invalid model output');
  return choice;
 }
}
