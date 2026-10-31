// Only transitions produce sounds: reconnects and repeated snapshots stay quiet.
export function audioEvents(previous,next){
 const a=previous?.myShip,b=next?.myShip;if(!a||!b||a.id!==b.id||next.time<previous.time)return [];
 const events=[];
 if(!a.anchored&&b.anchored)events.push('anchor-chain');
 if(b.destination&&b.destination!==a.destination)events.push('sail-hoist');
 if(!a.away&&b.away)events.push('rowing');
 if(!a.boarding&&b.boarding)events.push('cutlass');
 if(b.hull<a.hull-2)events.push('hull-impact');
 if(b.fire>a.fire+5||b.leak>a.leak+5)events.push('ship-bell');
 if(previous.weather!==next.weather&&next.weather!=='Fair winds')events.push('storm');
 const known=new Set(a.log.map(e=>e.at+'|'+e.name+'|'+e.text));
 for(const e of b.log.filter(e=>!known.has(e.at+'|'+e.name+'|'+e.text))){if(e.kind==='reward')events.push('coins');else if(e.kind==='danger')events.push('ship-bell');}
 return [...new Set(events)].slice(0,4);
}
export function musicMood(state){
 const s=state?.myShip;if(!s)return 'lantern-harbour';
 if(s.boarding||s.fire>0||s.leak>20||s.lastShot>0&&state.time-s.lastShot<12||state.raiders?.some(e=>e.hull>0&&e.lastShot>0&&state.time-e.lastShot<10&&Math.hypot(e.x-s.x,e.z-s.z)<20))return 'black-sails';
 return s.anchored?'lantern-harbour':'open-sea';
}
export const SCORE_TITLES={'open-sea':'The Quarrelsome Sea','lantern-harbour':'Lanterns at Saltwick','black-sails':'Black Sails, Brass Guns'};
