import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const core=readFileSync(new URL('../src/l10n/text-core.js',import.meta.url),'utf8');
const {createTextTranslator}=await import('data:text/javascript;base64,'+Buffer.from(core).toString('base64'));
function setup(){
 const messages={play:'Spelen',falseFriend:'Do not translate twice',score:'Punten {v0} (+{v1})',joined:'{v0} kwam erbij',mode:'Modus: {v0}',japanese:'日本語の文章',quote:'{v0}: «{v1}»'};
 const t=createTextTranslator({direct:{Play:'play','Score: {v0} (+{v1})':'score','{v0} joined':'joined','Mode: {v0}':'mode',Japanese:'japanese', Spelen:'falseFriend','{v0}: “{v1}”':'quote'},patterns:[
  {source:'Score: {v0} (+{v1})',id:'score',protectedVariables:[]},
  {source:'{v0} joined',id:'joined',protectedVariables:['v0']},
  {source:'Mode: {v0}',id:'mode',protectedVariables:[]},
  {source:'{v0}: “{v1}”',id:'quote',protectedVariables:['v0']}
 ]},(id,vars)=>{let text=messages[id];for(const[k,v]of Object.entries(vars||{}))text=text.replaceAll('{'+k+'}',v);return text;});
 return {t,messages};
}
test('display lookup, escaped templates and nested labels retain their values',()=>{
 const {t}=setup();assert.equal(t.text('Play'),'Spelen');assert.equal(t.text('PLAY'),'SPELEN');
 assert.equal(t.text('Score: 4 (+2)'),'Punten 4 (+2)');assert.equal(t.text('Score: 4 +2'),'Score: 4 +2');
 assert.equal(t.text('Mode: Play'),'Modus: Spelen');assert.equal(t.text('constructor'),'constructor');assert.equal(t.text(4),4);
});
test('a player name equal to an interface label stays unchanged without disabling the label translation',()=>{
 const {t}=setup(),name='Play';assert.equal(t.text(t.keep(name)),'Play');assert.equal(name,'Play');
 assert.equal(t.text('Play joined'),'Play kwam erbij');assert.equal(t.text('Play: “Mode: Play”'),'Play: «Modus: Spelen»');assert.equal(t.text('Play'),'Spelen');
});
test('selector text changes without changing option values or mutating the source',()=>{
 const {t}=setup(),source=Object.freeze(['Play',Object.freeze({label:'Play',text:'Play',value:'Play',disabled:true})]);
 const options=t.options(source);assert.deepEqual(options,['Spelen',{label:'Spelen',text:'Spelen',value:'Play',disabled:true}]);
 assert.equal(source[0],'Play');assert.equal(source[1].label,'Play');
});
test('translated text is wrapped before layout and cached labels refresh after a locale change',()=>{
 const {t,messages}=setup();assert.deepEqual(t.wrap('Japanese',3,s=>Array.from(s).length).map(t.text),['日本語','の文章']);
 assert.deepEqual(t.wrap('Play',30,s=>s.length).map(t.text),['Spelen']);
 assert.equal(t.text('Play'),'Spelen');messages.play='Jouer';t.clear();assert.equal(t.text('Play'),'Jouer');
});
test('every installed table uses the complete source catalog and stable short message IDs',()=>{
 const tables=JSON.parse(readFileSync(new URL('../assets/strings.json',import.meta.url),'utf8'));
 const index=JSON.parse(readFileSync(new URL('../assets/localization/messages.json',import.meta.url),'utf8'));
 const english=tables['en-US'];assert.ok(Object.keys(english).length>100);
 for(const [source,id]of Object.entries(index.direct)){assert.ok(id.length<=256);assert.equal(english[id],source);assert.ok(!/\bfn\s+\w+\s*\(|\buniforms?\.|#include/.test(source),'shader source is not a message');}
 for(const [locale,table]of Object.entries(tables)){for(const id of Object.keys(english))assert.equal(typeof table[id],'string',locale+' '+id);}
});
