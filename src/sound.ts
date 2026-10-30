import { context } from 'starhermit:audio';

// Quiet procedural ship sounds use the engine mixer and its volume controls.
// Sources wait for a real player gesture in browsers; no autoplay workaround.
let enabled=true,ambience=false,noise:any=null,ocean:any=null,oceanGain:any=null,voices=0;
export function soundSettings(effects:boolean,sea:boolean){
 enabled=effects;ambience=sea;
 if(ambience&&!ocean){
  ocean=context.createBufferSource();ocean.buffer=context.createNoiseBuffer(2,'brown');ocean.loop=true;
  oceanGain=context.createGain();oceanGain.gain.value=.012;ocean.connect(oceanGain);oceanGain.connect(context.destination);ocean.start();
 }else if(!ambience&&ocean){ocean.stop();ocean=null;oceanGain.release();oceanGain=null;}
}
function bell(frequency:number,delay=0){
 const oscillator=context.createOscillator(),gain=context.createGain(),time=context.currentTime+delay;
 oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(.055,time+.008);gain.gain.exponentialRampToValueAtTime(.0001,time+.45);
 oscillator.connect(gain);gain.connect(context.destination);voices++;oscillator.onended=()=>{voices--;gain.release();};oscillator.start(time);oscillator.stop(time+.5);
}
export function cue(kind:string){
 if(!enabled||voices>6||context.state!=='running')return;
 if(kind==='reward'){bell(660);bell(880,.12);return;}
 if(kind==='danger'){bell(220);return;}
 if(kind!=='combat')return;
 if(!noise)noise=context.createNoiseBuffer(.8,'brown');
 const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),time=context.currentTime;
 source.buffer=noise;filter.type='lowpass';filter.frequency.setValueAtTime(700,time);filter.frequency.exponentialRampToValueAtTime(90,time+.65);gain.gain.setValueAtTime(.16,time);gain.gain.exponentialRampToValueAtTime(.0001,time+.7);
 source.connect(filter);filter.connect(gain);gain.connect(context.destination);voices++;source.onended=()=>{voices--;gain.release();filter.release();};source.start();
}
