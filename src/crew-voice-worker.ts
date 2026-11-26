import { CHIMERA_PATH, ChimeraSpeech } from './chimera-speech.js';
import type { VoiceParameters } from './chimera-speech.js';
import type { WorkerFiles } from 'starhermit:script';

declare const files:WorkerFiles;
declare function postMessage(data:unknown,transfer?:ArrayBuffer[]):void;

type Request={sequence:number;text:string;parameters:VoiceParameters}|{sequence:number};
let speech:ChimeraSpeech|undefined;
let samples:Float32Array|null=null;
let offset=0;

(globalThis as typeof globalThis & {onmessage:(event:{data:Request})=>Promise<void>}).onmessage=async({data})=>{
 speech??=await ChimeraSpeech.load(await files.readBytesAsync(CHIMERA_PATH));
 if('text' in data){
  samples=speech.begin(data.text,data.parameters);
  offset=0;
 }
 if(samples){
  // Native StarHermit interprets WASM. Renew the worker's fuel between batches.
  for(let block=0;block<4&&offset<samples.length;block++)offset=speech.render(samples,offset);
  if(offset<samples.length){
   postMessage({sequence:data.sequence,more:true});
   return;
  }
  speech.clear();
 }
 postMessage({sequence:data.sequence,samples},samples?[samples.buffer as ArrayBuffer]:[]);
 samples=null;
};
