type Synth = {
 memory:WebAssembly.Memory;
 input_ptr():number;
 output_ptr():number;
 prepare():void;
 plan(len:number, female:number, child:number, pitch:number, rate:number, roughness:number, breath:number):number;
 render(count:number):void;
 clear():void;
};

export const CHIMERA_PATH='assets/voices/chimera.wasm';
export const CREW_SAMPLE_RATE=24000;
export type VoiceParameters=[number,number,number,number,number,number];
const BLOCK=128;

export class ChimeraSpeech {
 constructor(private synth:Synth){}
 static async load(bytes:Uint8Array){
  const {instance}=await WebAssembly.instantiate(bytes);
  const synth=instance.exports as unknown as Synth;
  synth.prepare();
  return new ChimeraSpeech(synth);
 }

 begin(text:string,parameters:VoiceParameters){
  const bytes=new TextEncoder().encode(text.slice(0,180).replace(/[’‘]/g,"'").replace(/[—–]/g,', '));
  if(!bytes.length||bytes.length>720)return null;
  const synth=this.synth;
  new Uint8Array(synth.memory.buffer,synth.input_ptr(),bytes.length).set(bytes);
  const count=synth.plan(bytes.length,...parameters);
  return count?new Float32Array(count):null;
 }

 render(samples:Float32Array,offset:number){
  const synth=this.synth;
  const count=Math.min(BLOCK,samples.length-offset);
  synth.render(count);
  samples.set(new Float32Array(synth.memory.buffer,synth.output_ptr(),count),offset);
  return offset+count;
 }

 clear(){this.synth.clear();}
}
