// Authority coordinates remain stable in saved worlds; the scene uses metres.
export const METRES = 10;
export const SHIP_SCALE = 3;
export function bearing(heading = 0) { return ((180 - heading * 180 / Math.PI) % 360 + 360) % 360; }
export function compass(degrees) { return ['N','NE','E','SE','S','SW','W','NW'][Math.round(degrees / 45) % 8]; }
export function clock(time) {
 const minute = Math.floor(Math.max(0,time) % 240 * 6);
 return String(Math.floor(minute / 60)).padStart(2,'0') + ':' + String(minute % 60).padStart(2,'0');
}
export function daylight(time) { return Math.max(0,Math.sin((time % 240 / 240 - .25) * Math.PI * 2)); }
export function windSpeed(time, storm = false) { return Math.round(12 + 3 * Math.sin(time / 90) + (storm ? 8 : 0)); }
export function smoothPose(pose, target, dt) {
 if(!pose || Math.hypot(pose.x-target.x,pose.z-target.z)>12) return {x:target.x,z:target.z,heading:target.heading||0};
 const t=1-Math.exp(-Math.max(0,dt)*12),angle=Math.atan2(Math.sin((target.heading||0)-pose.heading),Math.cos((target.heading||0)-pose.heading));
 return {x:pose.x+(target.x-pose.x)*t,z:pose.z+(target.z-pose.z)*t,heading:pose.heading+angle*t};
}
export function boatProgress(time, away) {
 const age=Math.max(0,time-away.departAt),remaining=away.returnAt-time;
 return age<5?age/5:remaining<5?Math.max(0,remaining/5):1;
}

// Presentation fallback while the maritime module loads.
const blend=(dt,rate)=>1-Math.exp(-dt*rate);
const delta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));

export function cameraFrame(c, view){
 const {focus,foeX,foeZ,hasFoe,targetYaw,dt,elapsed,zoom,deck,orbitYaw,orbitPitch,shake,narrow,away}=view;
 c.battle+=(Number(hasFoe)-c.battle)*blend(dt,1.5);
 const gap=hasFoe?Math.hypot(foeX,foeZ):0;
 if(hasFoe){c.aimX=foeX;c.aimZ=foeZ;}
 focus.x+=c.aimX*.45*c.battle;
 focus.z+=c.aimZ*.45*c.battle;
 const targetRange=(narrow?1.2:1)*(away?1.15:1)*(1+c.battle*(Math.min(3.4,Math.max(1.3,gap*.24))-1));
 c.range+=(targetRange-c.range)*blend(dt,hasFoe?2:5);
 c.yaw+=delta(c.yaw,targetYaw)*blend(dt,4);
 const cx=focus.x*zoom*METRES,cz=focus.z*zoom*METRES,dist=1-zoom;
 const quake=shake*zoom,qx=Math.sin(elapsed*53)*quake*.6,qy=Math.sin(elapsed*71)*quake*.4;
 const yaw=c.yaw+orbitYaw*zoom;
 const elevation=Math.max(.12,Math.min(1.42,(deck>0?.74:.25)+orbitPitch*zoom));
 const reach=(deck>0?62.8:74)*zoom*c.range,flat=Math.cos(elevation)*reach;
 return [qx+cx+340*dist+Math.sin(yaw)*flat,qy+660*dist+Math.sin(elevation)*reach,
  cz+540*dist+Math.cos(yaw)*flat,cx,zoom*(deck>0?3:7.5),cz];
}

export function hullFrame(x,heading,pitch,bob,roll,furl,target,wave,dt,elapsed){
 const t=blend(dt,3),baseHeight=Math.sin(elapsed*1.3+x)*.12,baseRoll=Math.sin(elapsed+x)*.012;
 const nextFurl=furl==null?target:furl+Math.sign(target-furl)*Math.min(Math.abs(target-furl),dt*.45);
 if(!wave)return [baseHeight,pitch*(1-t),baseRoll,bob,roll,nextFurl];
 const previous=bob??baseHeight,sin=Math.sin(heading),cos=Math.cos(heading);
 const nextBob=previous+(wave.height-previous)*t;
 const nextPitch=pitch+(-Math.atan(wave.sx*sin+wave.sz*cos)-pitch)*t;
 const nextRoll=roll+(Math.atan(wave.sx*cos-wave.sz*sin)-roll)*t;
 return [nextBob,nextPitch,baseRoll+nextRoll,nextBob,nextRoll,nextFurl];
}
