import { files, runtime } from 'starhermit:engine';
import { context, createClip, play } from 'starhermit:audio';
import type { AudioClip, Sound } from 'starhermit:audio';
import { worker } from 'starhermit:script';
import type { Worker } from 'starhermit:script';
import { CHIMERA_PATH, CREW_SAMPLE_RATE, ChimeraSpeech } from './chimera-speech.js';
import type { VoiceParameters } from './chimera-speech.js';

// Each profile mixes vocal-tract anatomy and changes pitch, delivery and glottal character.
const PROFILES = {
 morrow: { name:'Mara Morrow', body:[.88,0], pitch:176, rate:1, roughness:.20, breath:.12, sample:'My ship. My course.' },
 brisk: { name:'Barnaby Brisk', body:[0,0], pitch:111, rate:1.03, roughness:.12, breath:.08, sample:'Eyes on the horizon, crew.' },
 fuse: { name:'Little Fuse', body:[.18,.56], pitch:249, rate:1.17, roughness:.20, breath:.17, sample:'A tiny fuse. A very big argument.' },
 peg: { name:'Peg Coppernail', body:[.52,0], pitch:143, rate:.91, roughness:.32, breath:.10, sample:'I can fix this, Captain.' },
 tallow: { name:'Auntie Tallow', body:[.73,0], pitch:125, rate:.84, roughness:.46, breath:.23, sample:'Soup is ready. Ask no questions.' },
 pip: { name:'Pip Gulliver', body:[.08,.25], pitch:190, rate:1.12, roughness:.05, breath:.32, sample:'I see land! I think.' },
};
type Sailor = keyof typeof PROFILES;
type Entry = { at:number; name:string; text:string; kind?:string; crewId?:string; seq?:number };
type Utterance = { id:Sailor; text:string; entry?:Entry; manual?:boolean; priority?:boolean; banter?:boolean };
type Ship = { id:string; clock?:number; log:Entry[]; crew:{ id:string; name:string }[] };
function isSailor(id:string|undefined): id is Sailor {
 return !!id && Object.prototype.hasOwnProperty.call(PROFILES,id);
}

function sameEntry(a:Entry,b:Entry){
 return a.seq!==undefined&&b.seq!==undefined?a.seq===b.seq:
  a.at===b.at&&a.name===b.name&&a.text===b.text&&a.kind===b.kind;
}

function entryKey(entry:Entry){
 return entry.seq??JSON.stringify([entry.at,entry.name,entry.text,entry.kind]);
}

export class CrewVoice {
 private synth:ChimeraSpeech|null=null;
 private nativeWorker:Worker|null=null;
 private nativeLine:Utterance|null=null;
 private sequence=0;
 private loading=false;
 private failed=false;
 private pending:Utterance|null=null;
 private banter:Utterance[]=[];
 private rendering:{ samples:Float32Array; offset:number; line:Utterance }|null=null;
 private playing:Sound|null=null;
 private playingLine:Utterance|null=null;
 private clip:AudioClip|null=null;
 private previous:Entry[]=[];
 private hidden=new Set<number|string>();
 private enabled=true;
 private gain=.65;
 private nextAt=0;

 settings(enabled:boolean,gain:number){
  this.enabled=enabled;
  this.gain=gain;
  if(!enabled||gain===0){
   this.stop();
   this.hidden.clear();
  }
  else if(this.playing)this.playing.fade(this.gain,.1);
 }

 reset(){
  this.stop();
  this.previous=[];
  this.hidden.clear();
  this.nextAt=0;
 }

 visibleLog(log:Entry[]){
  return this.hidden.size?log.filter(entry=>!this.hidden.has(entryKey(entry))):log;
 }

 get speakingEntry(){return this.playingLine?.entry;}

 stop(){
  this.pending=null;
  this.banter=[];
  this.stopPlayback();
 }

 private stopPlayback(){
  this.rendering=null;
  this.synth?.clear();
  this.nativeLine=null;
  this.sequence++;
  if(this.nativeWorker){
   void this.nativeWorker.terminate();
   this.nativeWorker=null;
  }
  this.playing=null;
  this.playingLine=null;
  this.clip?.dispose();
  this.clip=null;
 }

 observe(ship:Ship,initial:boolean,banterQuiet:boolean){
  if(!banterQuiet){
   this.banter=[];
   if(this.playingLine?.banter||this.rendering?.line.banter||this.nativeLine?.banter)this.stopPlayback();
  }
  const previous=this.previous;
  this.previous=ship.log.slice();
  const voiced=this.enabled&&this.gain>0&&!this.failed;
  if(initial){
   this.hidden.clear();
   const welcome=ship.log.length===1&&ship.log[0].at===0&&ship.log[0].name==='Mara';
   if(welcome&&voiced){
    const entry=ship.log[0];
    this.hidden.add(entryKey(entry));
    this.pending={id:'morrow',text:entry.text,entry};
   }
   return;
  }
  if(!voiced)return;
  if(this.hidden.size){
   const keys=new Set(ship.log.map(entryKey));
   for(const key of this.hidden)if(!keys.has(key))this.hidden.delete(key);
  }

  // Match the rolling log, including older seas whose entries lack sequence numbers.
  let overlap=Math.min(previous.length,ship.log.length);
  while(overlap&&!previous.slice(-overlap).every((entry,i)=>sameEntry(entry,ship.log[i])))overlap--;
  let latest:Utterance|null=null;
  for(const entry of ship.log.slice(overlap)){
   const speaker=entry.crewId||ship.crew.find(c=>entry.name===c.name||entry.name===c.name.split(' ')[0])?.id
    ||(entry.name==='Fuse'?'fuse':entry.name==='Tallow'?'tallow':undefined);
   if(!isSailor(speaker))continue;
   // Keep event reports readable while spoken remarks wait for their audio.
   if(!entry.kind||entry.kind==='crew'||entry.kind==='dialogue'||entry.kind==='banter'){
    this.hidden.add(entryKey(entry));
   }
   if(this.pending?.manual)continue;
   if(entry.kind==='banter'){
    if(banterQuiet&&context.state==='running'&&entry.at>=(ship.clock??entry.at)-12){
     this.banter.push({id:speaker,text:entry.text,entry,banter:true});
     if(this.banter.length>2)this.banter.shift();
    }
    continue;
   }
   if(latest?.priority&&entry.kind!=='dialogue')continue;
   latest={id:speaker,text:entry.text,entry,priority:entry.kind==='dialogue'};
  }
  if(latest&&(!this.pending?.priority||latest.priority))this.pending=latest;
 }

 preview(id:string){
  if(!isSailor(id)||!this.enabled||this.gain===0)return;
  this.stop();
  this.pending={id,text:PROFILES[id].sample,manual:true};
 }

 private async load(){
  this.loading=true;
  try{
   await files.fetch(CHIMERA_PATH);
   this.synth=await ChimeraSpeech.load(files.readBytes(CHIMERA_PATH));
  }catch(error){
   this.synth=null;
   this.fail(error);
  }finally{
   this.loading=false;
  }
 }

 private startNative(line:Utterance,parameters:VoiceParameters){
  if(!this.nativeWorker){
   const thread=worker('src/crew-voice-worker.ts',{type:'module'});
   this.nativeWorker=thread;
   thread.on('error',error=>this.fail(error));
   thread.on('message',({sequence,samples,more})=>{
    if(sequence!==this.sequence||!this.nativeLine)return;
    if(more){thread.post({sequence});return;}
    const ready=this.nativeLine;
    this.nativeLine=null;
    try{
     if(samples&&context.state==='running')this.playLine(samples,ready);
    }catch(error){this.fail(error);}
   });
  }
  this.nativeLine=line;
  this.nativeWorker.post({sequence:++this.sequence,text:line.text,parameters});
 }

 private fail(error:unknown){
  this.stop();
  this.failed=true;
  this.hidden.clear();
  console.warn('Crew voice playback unavailable: '+String(error));
 }

 private playLine(samples:Float32Array,line:Utterance){
  // Raise quiet speech and compress loud peaks before applying the player's volume.
  const boost=2.5,knee=.55,headroom=.35;
  for(let i=0;i<samples.length;i++){
   const boosted=samples[i]*boost;
   const over=Math.abs(boosted)-knee;
   samples[i]=over>0?Math.sign(boosted)*(knee+headroom*over/(headroom+over)):boosted;
  }
  const clip=createClip([samples],CREW_SAMPLE_RATE);
  this.clip=clip;
  const sound=play(clip,{bus:'effects',gain:this.gain,caption:{speaker:PROFILES[line.id].name,text:line.text}});
  this.playing=sound;
  this.playingLine=line;
  if(line.entry)this.hidden.delete(entryKey(line.entry));
  this.nextAt=performance.now()+(line.banter?2000:3500);
  sound.onEnded(()=>{
   if(this.playing!==sound)return;
   this.playing=null;
   this.playingLine=null;
   this.clip=null;
   clip.dispose();
  });
 }

 tick(){
  if(!this.enabled||this.gain===0||this.failed||context.state!=='running')return;
  if(this.playing||this.nativeLine||(!this.rendering&&!this.pending&&!this.banter.length))return;

  try{
   const start=performance.now();
   const line=this.pending||this.banter[0];
   if(!this.rendering&&line){
    if(!line.manual&&start<this.nextAt)return;
    const voice=PROFILES[line.id];
    const parameters:VoiceParameters=[voice.body[0],voice.body[1],voice.pitch,voice.rate,voice.roughness,voice.breath];
    const web=runtime()==='web';
    if(web&&!this.synth){
     if(!this.loading)void this.load();
     return;
    }
    if(line.banter)this.banter.shift();
    else this.pending=null;
    if(!web){
     this.startNative(line,parameters);
     return;
    }
    const samples=this.synth?.begin(line.text,parameters);
    if(!samples)return;
    this.rendering={samples,offset:0,line};
   }

   const job=this.rendering;
   const synth=this.synth;
   if(!job||!synth)return;
   do{
    job.offset=synth.render(job.samples,job.offset);
   }while(job.offset<job.samples.length&&performance.now()-start<2);
   if(job.offset<job.samples.length)return;
   this.rendering=null;
   synth.clear();
   this.playLine(job.samples,job.line);
  }catch(error){this.fail(error);}
 }
}
