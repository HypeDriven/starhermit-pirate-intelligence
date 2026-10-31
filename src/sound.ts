import {context,loadClip,play,stream} from 'starhermit:audio';
import {musicMood,SCORE_TITLES} from './audio-events.js';

const EVENTS=['cannon-fire','hull-impact','anchor-chain','sail-hoist','rowing','timber-chop','coins','ship-bell','repair-hammer','cutlass','ocean','storm','gulls','creaking-deck'];
const clips:any={},cooldowns:any={};let started=false,enabled=true,ambience=false,musicOn=true,musicGain=.35,effectsGain=.65,time=0,voices=0,music:any=null,track='',pending='',ocean:any=null,lastMoodChange=-999,workClock=0,airClock=0;
const retiring:any[]=[];
export function initAudio(){if(started)return;started=true;for(const id of EVENTS)loadClip('sfx/'+id+'.ogg').then(clip=>{clips[id]=clip;}).catch(()=>{});}
export function soundSettings(effects:boolean,sea:boolean,musicEnabled=true,musicVolume=.35,effectsVolume=.65){
 enabled=effects;ambience=sea;musicOn=musicEnabled;musicGain=Math.max(0,Math.min(1,musicVolume));effectsGain=Math.max(0,Math.min(1,effectsVolume));
 if(music&&musicOn)music.fade(musicGain,1);if(ocean)ocean.fade(enabled&&ambience ? .13*effectsGain : 0,1);
}
export function cue(event:string,gain=1){
 if(!enabled||voices>=6||context.state!=='running')return;const id=event==='reward'?'coins':event==='danger'?'ship-bell':event==='combat'?'cannon-fire':event,clip=clips[id];
 if(!clip||time<(cooldowns[id]||0))return;cooldowns[id]=time+(id==='cannon-fire'?.25:id==='coins'?.7:1.2);
 const sound=play(clip,{gain:effectsGain*gain*(id==='storm'?.45:1),bus:'effects'});voices++;sound.onEnded(()=>{voices--;});
}
function retire(){if(!music)return;music.fade(0,2);retiring.push({source:music,stopAt:time+2.1});music=null;while(retiring.length>1)retiring.shift().source.stop();}
export function audioUpdate(dt:number,state:any,closeView:boolean){
 time+=dt;for(let i=retiring.length-1;i>=0;i--)if(time>=retiring[i].stopAt){retiring[i].source.stop();retiring.splice(i,1);}
 if(context.state!=='running')return;
 if(!musicOn){retire();track='';pending='';}
 else{const mood=musicMood(state);if((!music||mood!==track&&(mood==='black-sails'||time-lastMoodChange>16))&&pending!==mood){
  retire();track=mood;pending=mood;lastMoodChange=time;music=stream('music/'+mood+'.ogg',{bus:'music',gain:0,loop:true});music.fade(musicGain,2);music.onStateChange((status:string)=>{if(status==='playing')pending='';});
 }}
 if(enabled&&ambience&&clips.ocean){if(!ocean)ocean=play(clips.ocean,{loop:true,gain:.13*effectsGain,bus:'effects'});}else if(ocean){ocean.stop();ocean=null;}
 workClock+=dt;airClock+=dt;
 const s=state?.myShip;if(!s)return;
 if(closeView&&workClock>4.8){workClock=0;if(s.away&&state.time-s.away.departAt>=5&&s.away.returnAt-state.time>5)cue(s.away.job==='timber'?'timber-chop':'repair-hammer',.35);else if(s.away)cue('rowing',.35);else if(s.crew.some((c:any)=>!c.away&&c.task==='repair')&&s.hull<s.maxHull)cue('repair-hammer',.3);}
 if(ambience&&airClock>24){airClock=0;cue(s.anchored?'gulls':'creaking-deck',.18);}
}
export function audioStatus(){return musicOn?(pending?'Preparing ': 'Playing ')+(SCORE_TITLES[track as keyof typeof SCORE_TITLES]||'the pirate score'):'Music off';}
export function audioSuspend(){if(music)music.pause();if(ocean){ocean.stop();ocean=null;}}
export function audioResume(){if(music&&musicOn)music.play();}
