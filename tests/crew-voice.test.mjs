import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

let voiceWorker,onPlay;
const engineModules={
 './chimera-speech.js':"export const CHIMERA_PATH='voice.wasm',CREW_SAMPLE_RATE=24000; export class ChimeraSpeech {}",
 'starhermit:engine':"export const runtime=()=>'native',files={};",
 'starhermit:audio':`export const context={state:'running'};
  export const createClip=()=>({dispose(){}});
  export const play=(...args)=>globalThis.crewVoiceTest.play(...args);`,
 'starhermit:script':'export const worker=()=>globalThis.crewVoiceTest.worker();',
};
globalThis.crewVoiceTest={
 play:(_clip,options)=>{onPlay(options.caption);return {onEnded(){}};},
 worker:()=>{
  const handlers={};
  return voiceWorker={
   on:(event,handler)=>{handlers[event]=handler;},
   post:({sequence})=>{voiceWorker.sequence=sequence;},
   finish:()=>handlers.message({sequence:voiceWorker.sequence,samples:new Float32Array([.1])}),
   terminate(){},
  };
 },
};
const hooks=registerHooks({resolve(specifier,context,next){
 const source=engineModules[specifier];
 return source?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(source)}:next(specifier,context);
}});
const {CrewVoice}=await import('../src/crew-voice.ts');
hooks.deregister();

const ship=(...log)=>({id:'ship',clock:25,log,crew:[{id:'peg',name:'Peg Coppernail'}]});
const remark={seq:1,at:24,name:'Peg',text:'The wood has opinions.',kind:'dialogue'};
const reward={seq:2,at:24,name:'Peg',text:'25 timber aboard.',kind:'reward'};

test('crew remarks join the visible log when the voice starts',()=>{
 const voice=new CrewVoice();
 voice.observe(ship(),true,true);
 voice.observe(ship(remark,reward),false,true);
 assert.deepEqual(voice.visibleLog(ship(remark,reward).log),[reward]);
 voice.tick();
 const snapshot=ship({...remark},{...reward});
 voice.observe(snapshot,false,true);
 assert.equal(voice.speakingEntry,undefined);
 onPlay=caption=>{
  assert.equal(caption.text,remark.text);
  assert.deepEqual(voice.visibleLog(snapshot.log),[reward]);
 };
 voiceWorker.finish();
 assert.deepEqual(voice.visibleLog(snapshot.log),snapshot.log);
 assert.equal(voice.speakingEntry,remark);
});

test('canceled banter stays hidden and muted voices use text',()=>{
 const voice=new CrewVoice();
 const banter={...remark,kind:'banter'};
 voice.observe(ship(),true,true);
 voice.observe(ship(banter),false,true);
 voice.tick();
 voice.observe(ship(banter),false,false);
 voiceWorker.finish();
 assert.deepEqual(voice.visibleLog(ship(banter).log),[]);
 voice.settings(false,.65);
 assert.deepEqual(voice.visibleLog(ship(banter,reward).log),[banter,reward]);
});
