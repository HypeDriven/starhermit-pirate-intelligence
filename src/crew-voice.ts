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
type Utterance = { id:Sailor; text:string; manual?:boolean; priority?:boolean };
type Entry = { at:number; name:string; text:string; kind?:string; crewId?:string; seq?:number };
type Ship = { id:string; log:Entry[]; crew:{ id:string; name:string }[] };
function isSailor(id:string|undefined): id is Sailor {
 return !!id && Object.prototype.hasOwnProperty.call(PROFILES,id);
}

function sameEntry(a:Entry,b:Entry){
 return a.seq!==undefined&&b.seq!==undefined?a.seq===b.seq:
  a.at===b.at&&a.name===b.name&&a.text===b.text&&a.kind===b.kind;
}

export class CrewVoice {
 private synth:ChimeraSpeech|null=null;
 private nativeWorker:Worker|null=null;
 private nativeLine:Utterance|null=null;
 private sequence=0;
 private loading=false;
 private failed=false;
 private pending:Utterance|null=null;
 private rendering:{ samples:Float32Array; offset:number; line:Utterance }|null=null;
 private playing:Sound|null=null;
 private clip:AudioClip|null=null;
 private previous:Entry[]=[];
 private enabled=true;
 private gain=.65;
 private nextAt=0;

 settings(enabled:boolean,gain:number){
  this.enabled=enabled;
  this.gain=gain;
  if(!enabled||gain===0)this.stop();
  else if(this.playing)this.playing.fade(this.gain*.8,.1);
 }

 reset(){
  this.stop();
  this.previous=[];
  this.nextAt=0;
 }

 stop(){
  this.pending=null;
  this.rendering=null;
  this.synth?.clear();
  this.nativeLine=null;
  this.sequence++;
  if(this.nativeWorker){
   void this.nativeWorker.terminate();
   this.nativeWorker=null;
  }
  this.playing=null;
  this.clip?.dispose();
  this.clip=null;
 }

 observe(ship:Ship,initial:boolean){
  const previous=this.previous;
  this.previous=ship.log.slice();
  if(initial){
   const welcome=ship.log.length===1&&ship.log[0].at===0&&ship.log[0].name==='Mara';
   if(welcome&&this.enabled)this.pending={id:'morrow',text:ship.log[0].text};
   return;
  }

  // Match the rolling log, including older seas whose entries lack sequence numbers.
  let overlap=Math.min(previous.length,ship.log.length);
  while(overlap&&!previous.slice(-overlap).every((entry,i)=>sameEntry(entry,ship.log[i])))overlap--;
  if(!this.enabled||this.gain===0||this.pending?.manual)return;

  let latest:Utterance|null=null;
  for(const entry of ship.log.slice(overlap)){
   const speaker=entry.crewId||ship.crew.find(c=>entry.name===c.name||entry.name===c.name.split(' ')[0])?.id
    ||(entry.name==='Fuse'?'fuse':entry.name==='Tallow'?'tallow':undefined);
   if(!isSailor(speaker))continue;
   if(latest?.priority&&entry.kind!=='dialogue')continue;
   latest={id:speaker,text:entry.text,priority:entry.kind==='dialogue'};
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
   this.failed=true;
   this.synth=null;
   console.warn('Crew voices unavailable: '+String(error));
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
  console.warn('Crew voice playback unavailable: '+String(error));
 }

 private playLine(samples:Float32Array,line:Utterance){
  const clip=createClip([samples],CREW_SAMPLE_RATE);
  this.clip=clip;
  const sound=play(clip,{bus:'effects',gain:this.gain*.8,caption:{speaker:PROFILES[line.id].name,text:line.text}});
  this.playing=sound;
  this.nextAt=performance.now()+3500;
  sound.onEnded(()=>{
   if(this.playing!==sound)return;
   this.playing=null;
   this.clip=null;
   clip.dispose();
  });
 }

 tick(){
  if(!this.enabled||this.gain===0||this.failed||context.state!=='running')return;
  if(this.playing||this.nativeLine||(!this.rendering&&!this.pending))return;

  try{
   const start=performance.now();
   if(!this.rendering&&this.pending){
    const line=this.pending;
    if(!line.manual&&start<this.nextAt)return;
    const voice=PROFILES[line.id];
    const parameters:VoiceParameters=[voice.body[0],voice.body[1],voice.pitch,voice.rate,voice.roughness,voice.breath];
    if(runtime()!=='web'){
     this.pending=null;
     this.startNative(line,parameters);
     return;
    }
    if(!this.synth){
     if(!this.loading)void this.load();
     return;
    }
    this.pending=null;
    const samples=this.synth.begin(line.text,parameters);
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
