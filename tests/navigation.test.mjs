import test from 'node:test';
import assert from 'node:assert/strict';
import {bearing,compass,clock,daylight,windSpeed,smoothPose,boatProgress} from '../src/navigation.js';

test('compass follows authority axes and wraps north correctly',()=>{
 for(const [heading,expected] of [[0,'S'],[Math.PI/2,'E'],[Math.PI,'N'],[-Math.PI/2,'W'],[Math.PI*3,'N']])assert.equal(compass(bearing(heading)),expected);
});
test('nautical clock rolls over at midnight with daylight at noon',()=>{
 assert.equal(clock(0),'00:00');assert.equal(clock(120),'12:00');assert.equal(clock(239.99),'23:59');assert.equal(clock(240),'00:00');
 assert.equal(daylight(0),0);assert.equal(daylight(120),1);assert.equal(daylight(240),0);assert.equal(windSpeed(0,true)-windSpeed(0,false),8);
});
test('smooth movement uses shortest turn, converges and snaps recovery teleports',()=>{
 const start={x:0,z:0,heading:Math.PI-.05},target={x:1,z:1,heading:-Math.PI+.05};
 const p=smoothPose(start,target,1/60);assert.ok(p.x>0&&p.x<1);assert.ok(p.heading>start.heading);
 let pose=start;for(let i=0;i<120;i++)pose=smoothPose(pose,target,1/60);assert.ok(Math.abs(pose.x-1)<.0001);
 assert.deepEqual(smoothPose(start,{x:30,z:0,heading:0},1/60),{x:30,z:0,heading:0});
 assert.deepEqual(smoothPose(start,target,0),start);
});
test('smoothing is independent of frame rate',()=>{
 let a={x:0,z:0,heading:0},b={...a},target={x:5,z:3,heading:1};
 for(let i=0;i<30;i++)a=smoothPose(a,target,1/30);for(let i=0;i<120;i++)b=smoothPose(b,target,1/120);
 assert.ok(Math.abs(a.x-b.x)<1e-10);assert.ok(Math.abs(a.heading-b.heading)<1e-10);
});
test('longboat stays ashore during the extra time of a risky encounter',()=>{
 const safe={departAt:10,returnAt:32},risk={departAt:10,returnAt:40};
 assert.equal(boatProgress(10,safe),0);assert.equal(boatProgress(12.5,safe),.5);assert.equal(boatProgress(15,safe),1);
 assert.equal(boatProgress(29.5,safe),.5);assert.equal(boatProgress(29.5,risk),1);assert.equal(boatProgress(40,risk),0);
});
