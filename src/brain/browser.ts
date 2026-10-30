import { files, runtime } from 'starhermit:engine';
import { Tokenizer } from './tokenizer.js';
import { TinyModel } from './inference.js';
import { LOADS, loadSetting, brainRequest, nextWorkAt } from './policy.js';

// The game already runs off the browser's rendering thread. SIMD math runs in
// that realm so it uses the browser's WASM engine rather than an interpreted
// auxiliary worker. Work returns to StarHermit after every small time slice.
export class BrowserBrain {
 status='Waiting for the ship';
 load=0;
 private model:any=null;
 private loading=false;
 private failed=false;
 private copyOffset=0;
 private copying=false;
 private iterator:any=null;
 private request:any=null;
 private nextAt=0;
 private cursor=0;
 private attempts:Record<string,number>={};
 private generation=0;
 private stream:any=null;
 private paused=false;
 setLoad(value:number){
  const n=loadSetting(value);if(n===this.load)return;
  this.load=n;this.nextAt=0;
  if(n===3)this.cancel();
 }
 cancel(){this.iterator=null;this.request=null;this.generation++;if(this.model)this.model.prefix=[];}
 suspend(){this.paused=true;this.cancel();}
 resume(){this.paused=false;this.nextAt=0;}
 retry(){this.failed=false;this.status='Waiting to load the tiny model';}
 private async start(){
  this.loading=true;this.status='Downloading tiny model · 138 MB on first use';
  try{
   await files.fetch(['models/index.json','models/tokenizer.json','models/kernel.wasm']);
   const index:any=files.readJson('models/index.json');
   const tokenizer=new Tokenizer(files.readJson('models/tokenizer.json'));
   // The package remote index pins the GGUF bytes by SHA-256 and the engine
   // verifies them before a read. No model prompt or game state leaves here.
   await files.fetch(index.path,p=>{this.status='Downloading tiny model · '+Math.round(p.loadedBytes/1048576)+' MB';});
   const result=await WebAssembly.instantiate(files.readBytes('models/kernel.wasm'),{math:{exp:Math.exp}});
   this.model=new TinyModel(index,tokenizer,result.instance);
   this.copyOffset=0;this.copying=true;this.status='Preparing tiny model';
  }catch(e){this.failed=true;this.model=null;this.status='Tiny model unavailable · '+String(e).slice(0,160);}
  finally{this.loading=false;}
 }
 tick(state:any,configs:any,send:(c:any)=>void,stream:any){
  try{this.work(state,configs,send,stream);}
  catch(e){this.cancel();this.failed=true;this.status='Tiny model paused · '+String(e).slice(0,160);}
 }
 private work(state:any,configs:any,send:(c:any)=>void,stream:any){
  if(stream!==this.stream){this.stream=stream;this.cancel();this.attempts={};this.nextAt=0;}
  const setting=LOADS[this.load];
  if(!setting.duty){this.status='Paused · crew instincts continue';return;}
  if(this.paused||!state?.myShip)return;
  if(runtime?.()!=='web'){this.status='Browser brain runs in the web version';return;}
  const eligible=state.myShip.crew.filter((c:any)=>!configs[c.id]||configs[c.id].mode==='browser'||configs[c.id].mode==='tiny');
  if(!eligible.length){this.cancel();this.status='All characters use external endpoints';return;}
  if(this.failed||this.loading)return;
  if(!this.model){void this.start();return;}
  const start=performance.now();if(start<this.nextAt)return;
  if(this.copying){
   // A small ranged copy each frame avoids a 138 MB copy blocking the UI.
   const bytes=files.readBytes(this.model.index.path,this.copyOffset,Math.min(1048576,this.model.index.bytes-this.copyOffset));
   new Uint8Array(this.model.memory.buffer,this.model.base+this.copyOffset,bytes.length).set(bytes);
   this.copyOffset+=bytes.length;this.copying=this.copyOffset<this.model.index.bytes;
   this.status='Preparing tiny model · '+Math.round(this.copyOffset/this.model.index.bytes*100)+'%';
   this.nextAt=nextWorkAt(performance.now(),performance.now()-start,setting.duty);return;
  }
  if(!this.iterator){
   let selected:any=null;
   for(let i=0;i<eligible.length;i++){
    const c=eligible[(this.cursor+i)%eligible.length];
    if(!c.away&&state.time>=c.manualUntil&&start-(this.attempts[c.id]??-Infinity)>60000){selected=c;this.cursor=(this.cursor+i+1)%eligible.length;break;}
   }
   if(!selected){this.status='Ready · waiting for the next crew watch';return;}
   const input=brainRequest(state,selected);
   this.request={crewId:selected.id,ownerId:state.myShip.id,issuedAt:state.time,manualUntil:selected.manualUntil,revision:selected.orderRevision,emergency:input.emergency,generation:this.generation};
   this.attempts[selected.id]=start;this.iterator=this.model.choose(input.prompt,input.allowed);
   this.status='Thinking for '+selected.name.split(' ')[0];
  }
  const current=state.myShip.crew.find((c:any)=>c.id===this.request.crewId);
  if(!current||current.away||current.manualUntil!==this.request.manualUntil||current.orderRevision!==this.request.revision||state.myShip.id!==this.request.ownerId||
     (configs[current.id]&& !['tiny','browser'].includes(configs[current.id].mode))){this.cancel();return;}
  try{
   let done=false;
   do{
    const result=this.iterator.next();
    if(result.done){
     // Validate against the current ship, including orders issued while thinking.
     const live=brainRequest(state,current);
     if(live.allowed.includes(result.value)&&state.time>=current.manualUntil&&this.request.generation===this.generation){
      send({type:'decision',ownerId:state.myShip.id,crewId:current.id,task:result.value,issuer:'brisk',override:live.emergency,source:'browser'});
      console.info('Browser brain: '+current.id+' chose '+result.value+'.');
     }
     this.iterator=null;this.request=null;this.status='Ready · '+current.name.split(' ')[0]+' chose '+result.value;done=true;break;
    }
    if(result.value?.token)this.status='Thinking for '+current.name.split(' ')[0]+' · '+result.value.token+'/'+result.value.total;
   }while(performance.now()-start<setting.slice);
   const end=performance.now();this.nextAt=Math.max(nextWorkAt(end,end-start,setting.duty),done?end+setting.rest*1000:0);
  }catch(e){this.cancel();this.failed=true;this.status='Tiny model paused · '+String(e).slice(0,160);}
 }
}
