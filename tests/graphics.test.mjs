import test from 'node:test';
import assert from 'node:assert/strict';
import {visualProfile} from '../src/render/quality.js';

test('graphics tiers stay within engine ray-march and texture limits',()=>{
 for(let i=0;i<10;i++){
  const p=visualProfile(i);
  assert.ok(p.volumeSteps>=8&&p.volumeSteps<=128);
  assert.ok(p.volumeShadows>=0&&p.volumeShadows<=8);
  assert.ok(p.oceanResolution*4<=2048);
  assert.ok(p.wakeSegments<=95);
  if(i)for(const key of ['oceanResolution','oceanSegments','reflectionWidth','clouds','volumeSteps','volumeShadows','combatVolumes','fireVolumes','hazeSteps','wakeSegments'])assert.ok(p[key]>=visualProfile(i-1)[key],key+' should scale monotonically');
 }
});
test('low tiers avoid FFT and volumes; Infinite enables the complete workload',()=>{
 for(const i of [0,1,2]){const p=visualProfile(i);assert.equal(p.fft,false);assert.equal(p.clouds,0);assert.equal(p.combatVolumes,0);assert.equal(p.hazeSteps,0);}
 const p=visualProfile(9);assert.equal(p.oceanResolution,512);assert.equal(p.reflectionWidth,3840);assert.equal(p.volumeSteps,128);assert.equal(p.volumeShadows,8);assert.equal(p.clouds,16);assert.equal(p.combatVolumes,24);
 assert.deepEqual(visualProfile(-10),visualProfile(0));assert.deepEqual(visualProfile(100),p);
});
