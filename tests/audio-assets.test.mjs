import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
const root=new URL('../',import.meta.url),read=path=>fs.readFileSync(new URL(path,root));
test('every score cue and event effect is packaged, nonempty and matches its manifest',()=>{
 const music=JSON.parse(read('music/manifest.json')),effects=JSON.parse(read('sfx/manifest.json'));
 assert.equal(music.tracks.length,3);assert.equal(effects.effects.length,14);
 let bytes=0;for(const item of [...music.tracks,...effects.effects]){const data=read(item.file);assert.equal(data.subarray(0,4).toString(),'OggS',item.file);assert.ok(data.length>2000);assert.ok(item.duration>.1&&Number.isFinite(item.duration));assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256,item.file);bytes+=data.length;}
 assert.ok(bytes<5*1024*1024,'The soundtrack and effects should remain a small download.');
});
test('every MOSS effect documents its event, audible description and gameplay context',()=>{
 const effects=JSON.parse(read('sfx/manifest.json')).effects,manifest=read('sfx/manifest.txt').toString();
 for(const e of effects){assert.ok(e.event&&e.prompt&&e.usage&&e.model.includes('MOSS'));assert.ok(manifest.includes(e.file+' | event: '+e.event));}
});
