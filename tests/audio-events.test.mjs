import test from 'node:test';
import assert from 'node:assert/strict';
import {audioEvents,musicMood} from '../src/audio-events.js';
const state=()=>({time:100,weather:'Fair winds',raiders:[],myShip:{id:'captain',x:0,z:0,anchored:true,destination:null,lastShot:0,hull:100,fire:0,leak:0,away:null,boarding:null,log:[]}});
test('initial sync, repeated snapshots and world switches do not replay effects',()=>{
 const s=state();s.myShip.log.push({at:90,name:'Peg',text:'Timber aboard',kind:'reward'});
 assert.deepEqual(audioEvents(null,s),[]);assert.deepEqual(audioEvents(s,structuredClone(s)),[]);
 const other=structuredClone(s);other.myShip.id='someone-else';assert.deepEqual(audioEvents(s,other),[]);
 const old=structuredClone(s);old.time=20;assert.deepEqual(audioEvents(s,old),[]);
});
test('arrivals, launches, impacts, boarding and rewards produce distinct cues',()=>{
 const s=state(),next=structuredClone(s);s.myShip.anchored=false;next.time++;
 next.myShip.away={};next.myShip.hull=89;next.myShip.log.push({at:101,name:'Captain',text:'Contract paid',kind:'reward'});
 assert.deepEqual(audioEvents(s,next),['anchor-chain','rowing','hull-impact','coins']);
 const course=structuredClone(s);course.myShip.destination='mossjaw';assert.deepEqual(audioEvents(s,course),['sail-hoist']);
 const board=structuredClone(s);board.myShip.boarding={};assert.deepEqual(audioEvents(s,board),['cutlass']);
});
test('multiple warning log lines are deduplicated',()=>{
 const a=state(),b=structuredClone(a);b.weather='Squall on the horizon';b.myShip.fire=15;
 for(const text of ['Fire!','Mind the bilge!'])b.myShip.log.push({at:100,name:'Peg',text,kind:'danger'});
 assert.deepEqual(audioEvents(a,b),['ship-bell','storm']);
});
test('music follows actual activity; a zero initial shot is not combat',()=>{
 const s=state();s.time=1;assert.equal(musicMood(s),'lantern-harbour');s.myShip.anchored=false;assert.equal(musicMood(s),'open-sea');
 s.time=20;s.myShip.lastShot=15;assert.equal(musicMood(s),'black-sails');s.time=40;assert.equal(musicMood(s),'open-sea');
 s.raiders.push({hull:90,x:1,z:2,lastShot:37});assert.equal(musicMood(s),'black-sails');s.raiders[0].x=50;assert.equal(musicMood(s),'open-sea');
});
