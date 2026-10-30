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
