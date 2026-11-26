// Single-threaded, cooperatively sliced SmolLM2 inference using GGUF Q8_0.
// Each yield bounds one chunk of matrix work; the scheduler decides when to resume.
export class TinyModel {
 constructor(index,tokenizer,wasm){
  this.index=index;this.tokenizer=tokenizer;this.w=wasm.exports;
  this.base=this.w.reserve(index.bytes);this.memory=this.w.memory;
  const alloc=n=>this.w.reserve(n*4);
  const pointers=values=>{
   const p=alloc(values.length);
   new Uint32Array(this.memory.buffer,p,values.length).set(values);
   return p;
  };
  this.x={p:alloc(576)};
  this.norm={p:alloc(576)};
  const rope=this.w.reserve(256*64*8);
  const angles=new Float64Array(this.memory.buffer,rope,256*64);
  for(let pos=0;pos<256;pos++)for(let j=0;j<64;j+=2){
   const angle=pos/Math.pow(index.ropeTheta,j/64);
   angles[pos*64+j]=Math.cos(angle);
   angles[pos*64+j+1]=Math.sin(angle);
  }
  // Table layouts match Buffers and Layer in tools/brain-transformer.rs.
  this.buffers=pointers([this.x.p,this.norm.p,alloc(576),alloc(192),alloc(192),
   alloc(576),alloc(576),alloc(1536),alloc(1536),alloc(256),rope]);
  const weights=['attn_norm','attn_q','attn_k','attn_v','attn_output','ffn_norm','ffn_gate','ffn_up','ffn_down'];
  this.layers=Array.from({length:30},(_,i)=>pointers([
   ...weights.map(name=>this.tensor('blk.'+i+'.'+name+'.weight').p),alloc(256*192),alloc(256*192)
  ]));
  this.embedding=this.tensor('token_embd.weight').p;
  this.outputNorm=this.tensor('output_norm.weight').p;
  this.prefix=[];
 }
 tensor(name){const t=this.index.tensors[name];if(!t)throw Error('Missing model tensor: '+name);return {...t,p:this.base+t.offset};}
 normalize(){this.w.normalize(this.norm.p,this.x.p,this.outputNorm,this.index.epsilon);}
 *prefill(tokens){
  let common=0;while(common<tokens.length-1&&common<this.prefix.length&&tokens[common]===this.prefix[common])common++;
  // Prefix K/V rows are valid only after a complete preceding request.
  const oldPrefix=this.prefix;this.prefix=[];
  for(let pos=common;pos<tokens.length;pos++){
   yield* this.forward(tokens[pos],pos);
   yield {token:pos+1,total:tokens.length,cached:Math.min(common,oldPrefix.length)};
  }
 }
 *forward(token,pos){
  this.w.embed(this.embedding,this.x.p,576,token);
  for(const layer of this.layers){
   let continuation=0;
   do{
    continuation=this.w.layer_step(this.buffers,layer,pos,continuation,this.index.epsilon);
    yield;
   }while(continuation);
  }
 }
 *choose(prompt,allowed){
  const encoded=this.tokenizer.encode(prompt);
  // Leave room for the task choices even when memories tokenize poorly.
  const tokens=encoded.length>256?encoded.slice(0,160).concat(encoded.slice(-96)):encoded;
  yield* this.prefill(tokens);
  this.normalize();
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
 *speak(prompt){
  const maxTokens=24;
  const tokens=this.tokenizer.encode(prompt).slice(-(256-maxTokens));
  yield* this.prefill(tokens);
  const output=this.tensor(this.index.tensors['output.weight']?'output.weight':'token_embd.weight');
  // Score printable speech tokens in slices and discourage repeated words.
  const spoken=new Map();
  let line='';
  for(let step=0;step<maxTokens;step++){
   this.normalize();
   let best=-Infinity,piece='',winner=-1;
   const vocabulary=this.tokenizer.speechVocabulary;
   for(let i=0;i<vocabulary.length;i++){
    const [id,word]=vocabulary[i];
    const score=this.w.score(output.p,this.norm.p,576,id)-(spoken.get(id)||0)*1.25;
    if(score>best){best=score;piece=word;winner=id;}
    if(i%128===127)yield;
   }
   if(winner<0||winner===this.tokenizer.endId)break;
   line+=piece;
   if(/[.!?]/.test(line)||line.length>=100)break;
   spoken.set(winner,(spoken.get(winner)||0)+1);
   yield* this.forward(winner,tokens.length+step);
   yield {token:step+1,total:maxTokens};
  }
  const sentence=line.trim().match(/^[^.!?]+[.!?]/)?.[0];
  return sentence&&sentence.length>=10&&sentence.length<=110&&/[a-z]/i.test(sentence)?sentence:'';
 }
}
